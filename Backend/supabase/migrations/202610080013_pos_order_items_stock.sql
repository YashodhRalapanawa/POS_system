-- ============================================================================
-- Migration: 202610080013_pos_order_items_stock.sql
-- Description: POS Order Items schema update (updated_at column),
--              inventory availability helper, and stock validation RPCs (Task 19).
-- ============================================================================

-- 1. Ensure updated_at column exists on public.order_items
alter table public.order_items
  add column if not exists updated_at timestamptz not null default now();

-- 2. Trigger for set_updated_at on order_items
drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at
  before update on public.order_items
  for each row execute function public.set_updated_at();

-- 3. Stock Availability function for one or multiple products in a store
create or replace function public.get_product_stock_availability(
  p_store_id uuid,
  p_product_ids uuid[]
)
returns table (
  product_id uuid,
  current_stock integer,
  reserved_stock integer,
  available_quantity integer,
  unit_of_measure text,
  is_active boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    p.id as product_id,
    coalesce(i.current_stock, 0)::integer as current_stock,
    coalesce(i.reserved_stock, 0)::integer as reserved_stock,
    (coalesce(i.current_stock, 0) - coalesce(i.reserved_stock, 0))::integer as available_quantity,
    coalesce(p.unit_of_measure, 'PCS') as unit_of_measure,
    (p.status = 'Active') as is_active
  from unnest(p_product_ids) as requested_id
  join public.products p on p.id = requested_id and p.store_id = p_store_id
  left join public.inventory i on i.product_id = p.id and i.store_id = p_store_id;
end;
$$;

-- 4. Atomic stock validation RPC function for POS order items
create or replace function public.validate_pos_order_stock(
  p_store_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allow_negative boolean := false;
  v_aggregated jsonb := '{}'::jsonb;
  v_item jsonb;
  v_prod_id text;
  v_qty integer;
  v_results jsonb := '[]'::jsonb;
  v_all_valid boolean := true;
  v_prod record;
  v_current_stock integer;
  v_reserved_stock integer;
  v_avail integer;
  v_item_valid boolean;
  v_item_msg text;
begin
  -- 1. Read store settings for negative stock policy
  select coalesce(s.allow_negative_stock, false)
  into v_allow_negative
  from public.store_settings s
  where s.store_id = p_store_id;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object(
      'valid', false,
      'allowNegativeStock', v_allow_negative,
      'message', 'Cart is empty',
      'items', '[]'::jsonb
    );
  end if;

  -- 2. Aggregate duplicate product quantities
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_prod_id := v_item ->> 'productId';
    if v_prod_id is null or v_prod_id = '' then
      v_prod_id := v_item ->> 'product_id';
    end if;

    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_prod_id is not null then
      if v_aggregated ? v_prod_id then
        v_aggregated := jsonb_set(
          v_aggregated,
          array[v_prod_id],
          to_jsonb((v_aggregated ->> v_prod_id)::integer + v_qty)
        );
      else
        v_aggregated := jsonb_set(
          v_aggregated,
          array[v_prod_id],
          to_jsonb(v_qty)
        );
      end if;
    end if;
  end loop;

  -- 3. Check availability for each aggregated product
  for v_prod_id, v_qty in select key, value::text::integer from jsonb_each(v_aggregated) loop
    v_item_valid := true;
    v_item_msg := '';

    -- Check if product exists in store and is active
    select id, name, sku, status, unit_of_measure
    into v_prod
    from public.products
    where id = v_prod_id::uuid and store_id = p_store_id;

    if not found then
      v_item_valid := false;
      v_item_msg := 'Product not found in this store';
      v_current_stock := 0;
      v_reserved_stock := 0;
      v_avail := 0;
    elsif v_prod.status <> 'Active' then
      v_item_valid := false;
      v_item_msg := format('Product "%s" is inactive', v_prod.name);
      v_current_stock := 0;
      v_reserved_stock := 0;
      v_avail := 0;
    elsif v_qty <= 0 then
      v_item_valid := false;
      v_item_msg := 'Quantity must be greater than zero';
      v_current_stock := 0;
      v_reserved_stock := 0;
      v_avail := 0;
    else
      -- Check inventory
      select
        coalesce(i.current_stock, 0),
        coalesce(i.reserved_stock, 0)
      into v_current_stock, v_reserved_stock
      from public.inventory i
      where i.product_id = v_prod.id and i.store_id = p_store_id;

      if not found then
        v_current_stock := 0;
        v_reserved_stock := 0;
      end if;

      v_avail := v_current_stock - v_reserved_stock;

      if v_qty > v_avail and not v_allow_negative then
        v_item_valid := false;
        v_item_msg := format('Insufficient stock: %s available, %s requested', v_avail, v_qty);
      end if;
    end if;

    if not v_item_valid then
      v_all_valid := false;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'productId', v_prod_id,
      'productName', coalesce(v_prod.name, 'Unknown Product'),
      'sku', coalesce(v_prod.sku, ''),
      'requestedQuantity', v_qty,
      'currentStock', v_current_stock,
      'reservedStock', v_reserved_stock,
      'availableQuantity', v_avail,
      'valid', v_item_valid,
      'message', v_item_msg
    ));
  end loop;

  return jsonb_build_object(
    'valid', v_all_valid,
    'allowNegativeStock', v_allow_negative,
    'items', v_results
  );
end;
$$;

-- 5. Atomic create_pos_draft_order with stock validation
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
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_unit_price numeric(12, 2);
  v_unit_cost numeric(12, 2);
  v_line_subtotal numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_existing_order record;
  v_stock_check jsonb;
  v_stock_item jsonb;
begin
  -- 1. Idempotency check
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

  -- 2. Customer validation / default walk-in
  if v_customer_id is null then
    select id into v_customer_id
    from public.customers
    where store_id = p_store_id and is_walk_in = true
    limit 1;

    if v_customer_id is null then
      select id into v_customer_id
      from public.customers
      where store_id = p_store_id
      order by created_at asc
      limit 1;
    end if;
  end if;

  if v_customer_id is null then
    raise exception 'No customer available for this store';
  end if;

  -- 3. Items validation
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart must contain at least one item';
  end if;

  -- 4. Stock validation (checks negative stock policy and aggregated availability)
  v_stock_check := public.validate_pos_order_stock(p_store_id, p_items);
  if not (v_stock_check ->> 'valid')::boolean then
    for v_stock_item in select value from jsonb_array_elements(v_stock_check -> 'items') loop
      if not (v_stock_item ->> 'valid')::boolean then
        raise exception 'Stock validation failed: %', (v_stock_item ->> 'message');
      end if;
    end loop;
    raise exception 'Stock validation failed for one or more items';
  end if;

  -- 5. Calculate totals and prepare items
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

    v_unit_price := round(v_product.selling_price::numeric, 2);
    v_line_subtotal := round(v_qty * v_unit_price, 2);
    v_subtotal := v_subtotal + v_line_subtotal;
  end loop;

  -- 6. Generate order number
  v_order_number := public.next_document_number(p_store_id, 'order');
  if v_order_number is null or btrim(v_order_number) = '' then
    v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8);
  end if;

  -- 7. Insert order header
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
    v_order_number,
    'draft',
    v_subtotal,
    v_subtotal,
    p_notes,
    p_idempotency_key
  ) returning id into v_order_id;

  -- 8. Insert order items
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::integer;

    select id, name, sku, selling_price, purchase_price, tax_rate
    into v_product
    from public.products
    where id = (v_item ->> 'productId')::uuid and store_id = p_store_id;

    v_unit_price := round(v_product.selling_price::numeric, 2);
    v_unit_cost := round(coalesce(v_product.purchase_price, 0)::numeric, 2);
    v_line_subtotal := round(v_qty * v_unit_price, 2);

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
      line_total,
      updated_at
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
      v_line_subtotal,
      now()
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'total_amount', v_subtotal,
    'status', 'draft'
  );
end;
$$;

-- 6. Atomic update_pos_draft_order with stock validation
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
  v_customer_id uuid := p_customer_id;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_unit_price numeric(12, 2);
  v_unit_cost numeric(12, 2);
  v_line_subtotal numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_stock_check jsonb;
  v_stock_item jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Order not found in this store';
  end if;

  if lower(v_order.status) <> 'draft' then
    raise exception 'Only draft orders can be modified. Current status: %', v_order.status;
  end if;

  -- Validate customer if changed
  if v_customer_id is not null then
    perform 1 from public.customers
    where id = v_customer_id and store_id = p_store_id;

    if not found then
      raise exception 'Customer not found in this store';
    end if;
  else
    v_customer_id := v_order.customer_id;
  end if;

  -- Process items if provided
  if p_items is not null then
    if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Cart must contain at least one item';
    end if;

    -- Stock validation
    v_stock_check := public.validate_pos_order_stock(p_store_id, p_items);
    if not (v_stock_check ->> 'valid')::boolean then
      for v_stock_item in select value from jsonb_array_elements(v_stock_check -> 'items') loop
        if not (v_stock_item ->> 'valid')::boolean then
          raise exception 'Stock validation failed: %', (v_stock_item ->> 'message');
        end if;
      end loop;
      raise exception 'Stock validation failed for one or more items';
    end if;

    -- Replace items atomically
    delete from public.order_items where order_id = p_order_id;

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

      v_unit_price := round(v_product.selling_price::numeric, 2);
      v_unit_cost := round(coalesce(v_product.purchase_price, 0)::numeric, 2);
      v_line_subtotal := round(v_qty * v_unit_price, 2);
      v_subtotal := v_subtotal + v_line_subtotal;

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
        line_total,
        updated_at
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
        v_line_subtotal,
        now()
      );
    end loop;
  else
    v_subtotal := v_order.subtotal;
  end if;

  -- Update header
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

-- 7. Grants
grant execute on function public.get_product_stock_availability to authenticated, service_role;
grant execute on function public.validate_pos_order_stock to authenticated, service_role;
grant execute on function public.create_pos_draft_order to authenticated, service_role;
grant execute on function public.update_pos_draft_order to authenticated, service_role;
