-- ============================================================================
-- Migration: 202610080012_pos_orders.sql
-- Description: Dynamic POS order permissions, status check constraints,
--              idempotency column, RLS policies, and atomic RPC functions
--              for Draft POS Order Management (Task 18).
-- ============================================================================

-- 1. Register dynamic POS order permissions
insert into public.permissions (key, description, module, name)
values
  ('pos_orders.view', 'Browse, search, and view POS order history and details', 'POS Orders', 'View POS Orders'),
  ('pos_orders.create', 'Create and save draft POS orders from the cart', 'POS Orders', 'Create POS Order'),
  ('pos_orders.update', 'Edit and modify products or customers on draft POS orders', 'POS Orders', 'Update POS Order'),
  ('pos_orders.cancel', 'Cancel eligible draft POS orders', 'POS Orders', 'Cancel POS Order')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Dynamically assign new permissions to roles that possess pos.use, orders.view, or orders.manage
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id = rp.permission_id
cross join public.permissions p_new
where p_old.key in ('pos.use', 'orders.view', 'orders.manage')
  and p_new.key in ('pos_orders.view', 'pos_orders.create', 'pos_orders.update', 'pos_orders.cancel')
on conflict (role_id, permission_id) do nothing;

-- 3. Update orders status check constraint to support draft and cancelled states
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (lower(status) in ('draft', 'cancelled', 'held', 'pending', 'completed', 'refunded'));
alter table public.orders alter column status set default 'draft';

-- 4. Idempotency support to prevent duplicate orders upon repeated submissions
alter table public.orders add column if not exists idempotency_key text;
create index if not exists orders_store_idempotency_idx
  on public.orders (store_id, idempotency_key)
  where idempotency_key is not null;

-- 5. Additional search and filter indexes
create index if not exists orders_store_status_idx on public.orders (store_id, status);
create index if not exists orders_store_created_desc_idx on public.orders (store_id, created_at desc);

-- 6. Update RLS policies to include pos_orders.view
drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['orders.view', 'pos_orders.view', 'invoices.view', 'returns.view', 'reports.view']))
  );

drop policy if exists "staff read order items" on public.order_items;
create policy "staff read order items" on public.order_items
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['orders.view', 'pos_orders.view', 'invoices.view', 'returns.view', 'reports.view']))
  );

-- 7. Atomic RPC function to create a draft POS order
create or replace function public.create_pos_draft_order(
  p_store_id uuid,
  p_cashier_user_id uuid,
  p_customer_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_idempotency_key text default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid := p_customer_id;
  v_customer_name text;
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_unit_price numeric(12, 2);
  v_unit_cost numeric(12, 2);
  v_line_subtotal numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_items_count integer := 0;
  v_existing_order record;
begin
  -- 1. Idempotency check: if an order with this key already exists for this store, return it
  if p_idempotency_key is not null and btrim(p_idempotency_key) <> '' then
    select id, order_number, subtotal, total_amount, status
    into v_existing_order
    from public.orders
    where store_id = p_store_id and idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'success', true,
        'order_id', v_existing_order.id,
        'order_number', v_existing_order.order_number,
        'subtotal', v_existing_order.subtotal,
        'total_amount', v_existing_order.total_amount,
        'status', v_existing_order.status,
        'is_duplicate', true
      );
    end if;
  end if;

  -- 2. Validate / resolve customer
  if v_customer_id is null then
    select id, name into v_customer_id, v_customer_name
    from public.customers
    where store_id = p_store_id and is_walk_in = true
    limit 1;

    if v_customer_id is null then
      select id, name into v_customer_id, v_customer_name
      from public.customers
      where store_id = p_store_id
      order by created_at asc
      limit 1;
    end if;
  else
    select id, name into v_customer_id, v_customer_name
    from public.customers
    where id = v_customer_id and store_id = p_store_id and status = 'Active';

    if not found then
      raise exception 'Customer not found or inactive for this store';
    end if;
  end if;

  -- 3. Validate items array
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart must contain at least one item';
  end if;

  -- Pre-flight validation on all items
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be a positive integer';
    end if;

    select id, name, sku, selling_price, purchase_price, tax_rate, status
    into v_product
    from public.products
    where id = (v_item ->> 'productId')::uuid and store_id = p_store_id;

    if not found then
      raise exception 'Product not found in this store';
    end if;

    if v_product.status <> 'Active' then
      raise exception 'Product "%" is inactive and cannot be ordered', v_product.name;
    end if;
  end loop;

  -- 4. Create order header
  insert into public.orders (
    store_id,
    customer_id,
    cashier_user_id,
    order_number,
    status,
    subtotal,
    total_amount,
    notes,
    idempotency_key
  ) values (
    p_store_id,
    v_customer_id,
    p_cashier_user_id,
    coalesce(public.next_document_number(p_store_id, 'order'), 'ORD-0001'),
    'draft',
    0,
    0,
    coalesce(p_notes, ''),
    p_idempotency_key
  )
  returning id, order_number into v_order_id, v_order_number;

  -- 5. Insert order items with authoritative prices
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::integer;

    select id, name, sku, selling_price, purchase_price, tax_rate
    into v_product
    from public.products
    where id = (v_item ->> 'productId')::uuid and store_id = p_store_id;

    v_unit_price := round(v_product.selling_price::numeric, 2);
    v_unit_cost := round(coalesce(v_product.purchase_price, 0)::numeric, 2);
    v_line_subtotal := round(v_qty * v_unit_price, 2);
    v_subtotal := v_subtotal + v_line_subtotal;
    v_items_count := v_items_count + 1;

    insert into public.order_items (
      store_id,
      order_id,
      product_id,
      product_name,
      sku,
      quantity,
      unit_price,
      unit_cost,
      discount_amount,
      tax_rate,
      tax_amount,
      line_total
    ) values (
      p_store_id,
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.sku,
      v_qty,
      v_unit_price,
      v_unit_cost,
      0,
      coalesce(v_product.tax_rate, 0),
      0,
      v_line_subtotal
    );
  end loop;

  -- 6. Update order header totals
  update public.orders
  set subtotal = v_subtotal,
      total_amount = v_subtotal
  where id = v_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'total_amount', v_subtotal,
    'customer_id', v_customer_id,
    'customer_name', v_customer_name,
    'status', 'draft',
    'item_count', v_items_count
  );
end;
$$;

-- 8. Atomic RPC function to update a draft POS order
create or replace function public.update_pos_draft_order(
  p_order_id uuid,
  p_store_id uuid,
  p_customer_id uuid default null,
  p_items jsonb default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_customer_id uuid;
  v_customer_name text;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_unit_price numeric(12, 2);
  v_unit_cost numeric(12, 2);
  v_line_subtotal numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_items_count integer := 0;
begin
  -- 1. Fetch and lock order
  select * into v_order
  from public.orders
  where id = p_order_id and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Order not found for this store';
  end if;

  if lower(v_order.status) <> 'draft' then
    raise exception 'Only draft orders can be updated. Current status is %', v_order.status;
  end if;

  -- 2. Validate customer
  v_customer_id := coalesce(p_customer_id, v_order.customer_id);
  if v_customer_id is not null then
    select id, name into v_customer_id, v_customer_name
    from public.customers
    where id = v_customer_id and store_id = p_store_id and status = 'Active';

    if not found then
      raise exception 'Customer not found or inactive for this store';
    end if;
  end if;

  -- 3. Replace items if provided
  if p_items is not null then
    if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Cart must contain at least one item';
    end if;

    -- Pre-flight validation
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_qty := (v_item ->> 'quantity')::integer;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Quantity must be a positive integer';
      end if;

      select id, name, sku, selling_price, purchase_price, tax_rate, status
      into v_product
      from public.products
      where id = (v_item ->> 'productId')::uuid and store_id = p_store_id;

      if not found then
        raise exception 'Product not found in this store';
      end if;

      if v_product.status <> 'Active' then
        raise exception 'Product "%" is inactive and cannot be ordered', v_product.name;
      end if;
    end loop;

    -- Replace items atomically
    delete from public.order_items where order_id = p_order_id;

    for v_item in select value from jsonb_array_elements(p_items) loop
      v_qty := (v_item ->> 'quantity')::integer;

      select id, name, sku, selling_price, purchase_price, tax_rate
      into v_product
      from public.products
      where id = (v_item ->> 'productId')::uuid and store_id = p_store_id;

      v_unit_price := round(v_product.selling_price::numeric, 2);
      v_unit_cost := round(coalesce(v_product.purchase_price, 0)::numeric, 2);
      v_line_subtotal := round(v_qty * v_unit_price, 2);
      v_subtotal := v_subtotal + v_line_subtotal;
      v_items_count := v_items_count + 1;

      insert into public.order_items (
        store_id,
        order_id,
        product_id,
        product_name,
        sku,
        quantity,
        unit_price,
        unit_cost,
        discount_amount,
        tax_rate,
        tax_amount,
        line_total
      ) values (
        p_store_id,
        p_order_id,
        v_product.id,
        v_product.name,
        v_product.sku,
        v_qty,
        v_unit_price,
        v_unit_cost,
        0,
        coalesce(v_product.tax_rate, 0),
        0,
        v_line_subtotal
      );
    end loop;
  else
    v_subtotal := v_order.subtotal;
  end if;

  -- 4. Update header
  update public.orders
  set customer_id = v_customer_id,
      subtotal = v_subtotal,
      total_amount = v_subtotal,
      notes = coalesce(p_notes, notes),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'subtotal', v_subtotal,
    'total_amount', v_subtotal,
    'customer_id', v_customer_id,
    'status', 'draft'
  );
end;
$$;

-- 9. Atomic RPC function to cancel a draft POS order
create or replace function public.cancel_pos_draft_order(
  p_order_id uuid,
  p_store_id uuid,
  p_user_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_notes text;
begin
  select * into v_order
  from public.orders
  where id = p_order_id and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Order not found for this store';
  end if;

  if lower(v_order.status) = 'cancelled' then
    raise exception 'Order is already cancelled';
  end if;

  if lower(v_order.status) <> 'draft' then
    raise exception 'Only draft orders can be cancelled. Current status is %', v_order.status;
  end if;

  v_notes := coalesce(v_order.notes, '');
  if p_reason is not null and btrim(p_reason) <> '' then
    if v_notes <> '' then
      v_notes := v_notes || E'\n' || 'Cancelled reason: ' || p_reason;
    else
      v_notes := 'Cancelled reason: ' || p_reason;
    end if;
  end if;

  update public.orders
  set status = 'cancelled',
      notes = v_notes,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'status', 'cancelled'
  );
end;
$$;

-- 10. Grants for RPC execution
grant execute on function public.create_pos_draft_order to authenticated, service_role;
grant execute on function public.update_pos_draft_order to authenticated, service_role;
grant execute on function public.cancel_pos_draft_order to authenticated, service_role;
