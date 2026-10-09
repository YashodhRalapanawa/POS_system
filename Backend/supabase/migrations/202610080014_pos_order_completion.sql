-- ============================================================================
-- Migration: 202610080014_pos_order_completion.sql
-- Description: POS Order Completion, Automatic Stock Deduction, and
--              Sale Inventory Movements (Task 20).
-- ============================================================================

-- 1. Register pos_orders.complete permission
insert into public.permissions (key, description, module, name) values
  ('pos_orders.complete', 'Complete and finalize POS draft orders, automatically deducting inventory', 'POS Orders', 'Complete POS Order')
on conflict (key) do update
  set description = excluded.description,
      module = excluded.module,
      name = excluded.name;

-- 2. Dynamically grant pos_orders.complete to roles having orders.manage or pos.use or pos_orders.create
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_new.id
from public.role_permissions rp
join public.permissions p on p.id = rp.permission_id
cross join (select id from public.permissions where key = 'pos_orders.complete') p_new
where p.key in ('orders.manage', 'orders.create', 'pos.use', 'pos_orders.create')
on conflict do nothing;

-- 3. Ensure completed_by column exists on public.orders
alter table public.orders
  add column if not exists completed_by uuid references public.users (id) on delete set null;

-- 4. Extend reference_type check constraint on stock_movements to support 'order' and 'pos order'
alter table public.stock_movements
  drop constraint if exists stock_movements_reference_type_check;

alter table public.stock_movements
  add constraint stock_movements_reference_type_check
  check (reference_type is null or lower(reference_type) in ('order', 'pos order', 'return', 'adjustment', 'purchase'));

-- 5. Atomic RPC function for complete_pos_order
create or replace function public.complete_pos_order(
  p_order_id uuid,
  p_store_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_item record;
  v_allow_negative boolean := false;
  v_prod record;
  v_current_stock integer;
  v_reserved_stock integer;
  v_avail integer;
  v_item_count integer := 0;
  v_now timestamptz := now();
begin
  -- 1. Lock the order row to prevent concurrent completion
  select * into v_order
  from public.orders
  where id = p_order_id and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Order not found in this store';
  end if;

  -- 2. Idempotency protection: if already completed, return existing status safely
  if lower(v_order.status) = 'completed' then
    return jsonb_build_object(
      'success', true,
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', 'completed',
      'completed_at', v_order.completed_at,
      'is_duplicate', true,
      'message', 'Order is already completed'
    );
  end if;

  -- Verify order is still in draft status
  if lower(v_order.status) <> 'draft' then
    raise exception 'Only draft orders can be completed. Current status: %', v_order.status;
  end if;

  -- 3. Check negative stock setting for store
  select coalesce(s.allow_negative_stock, false)
  into v_allow_negative
  from public.store_settings s
  where s.store_id = p_store_id;

  -- 4. Verify order has items
  select count(*) into v_item_count
  from public.order_items
  where order_id = p_order_id and store_id = p_store_id;

  if v_item_count = 0 then
    raise exception 'Order contains no items to complete';
  end if;

  -- 5. Concurrency check & aggregate stock validation for duplicate product references
  for v_item in
    select product_id, sum(quantity)::integer as total_qty
    from public.order_items
    where order_id = p_order_id and store_id = p_store_id
    group by product_id
  loop
    -- Verify product exists and is active
    select id, name, sku, status
    into v_prod
    from public.products
    where id = v_item.product_id and store_id = p_store_id;

    if not found then
      raise exception 'Product % was not found in this store', v_item.product_id;
    end if;

    if v_prod.status <> 'Active' then
      raise exception 'Product "%" is inactive and cannot be sold', v_prod.name;
    end if;

    -- Lock inventory row for this product in this store
    select coalesce(current_stock, 0), coalesce(reserved_stock, 0)
    into v_current_stock, v_reserved_stock
    from public.inventory
    where product_id = v_item.product_id and store_id = p_store_id
    for update;

    if not found then
      v_current_stock := 0;
      v_reserved_stock := 0;
    end if;

    v_avail := v_current_stock - v_reserved_stock;
    if v_item.total_qty > v_avail and not v_allow_negative then
      raise exception 'Insufficient stock for "%": % available, % requested',
        v_prod.name, v_avail, v_item.total_qty;
    end if;
  end loop;

  -- 6. Insert Sale stock movement for each order item
  -- The existing apply_stock_movement trigger automatically locks inventory,
  -- deducts current_stock, and populates quantity_before and quantity_after.
  for v_item in
    select id, product_id, product_name, sku, quantity
    from public.order_items
    where order_id = p_order_id and store_id = p_store_id
  loop
    insert into public.stock_movements (
      store_id,
      product_id,
      adjustment_type,
      reason,
      quantity,
      reference_type,
      reference_id,
      notes,
      created_by,
      created_at
    ) values (
      p_store_id,
      v_item.product_id,
      'Sale',
      'Sale',
      v_item.quantity,
      'order',
      p_order_id,
      'POS Order #' || v_order.order_number,
      p_user_id,
      v_now
    );
  end loop;

  -- 7. Update order status to completed atomically
  update public.orders
  set status = 'completed',
      completed_at = v_now,
      completed_by = p_user_id,
      updated_at = v_now
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'status', 'completed',
    'completed_at', v_now
  );
end;
$$;

-- 6. Grants
grant execute on function public.complete_pos_order to authenticated, service_role;
