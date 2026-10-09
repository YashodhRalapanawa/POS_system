-- ============================================================================
-- Migration: 202610080001_chatbot_tools.sql
-- Description: Read-only reporting functions used by the POS assistant chatbot.
--
-- Every function runs as SECURITY INVOKER, so the caller's RLS policies apply
-- (store scoping + permission checks). Each one also asserts the permission it
-- needs and filters to the caller's store explicitly, as a second line of defence.
-- The functions never return secrets or personal contact details (no emails,
-- phone numbers, addresses, auth data or payment references).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.chat_assert_permission(p_keys text[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.current_user_store_id() is null then
    raise exception 'No active store for this user' using errcode = '42501';
  end if;
  if not public.has_any_permission(p_keys) then
    raise exception 'You do not have permission to view this information' using errcode = '42501';
  end if;
end;
$$;

-- Resolves the caller's store, its timezone and the [starts_at, ends_at) window
-- covering local dates p_from..p_to inclusive.
create or replace function public.chat_period(
  p_from date,
  p_to date,
  out store_id uuid,
  out tz text,
  out starts_at timestamptz,
  out ends_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null then
    raise exception 'Both from and to dates are required' using errcode = '22023';
  end if;
  if p_to < p_from then
    raise exception 'The "to" date must be on or after the "from" date' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'The date range cannot be longer than 366 days' using errcode = '22023';
  end if;

  store_id := public.current_user_store_id();
  select s.timezone into tz from public.stores as s where s.id = store_id;
  if tz is null or not exists (select 1 from pg_catalog.pg_timezone_names as z where z.name = tz) then
    tz := 'UTC';
  end if;

  starts_at := p_from::timestamp at time zone tz;
  ends_at := (p_to + 1)::timestamp at time zone tz;
end;
$$;

-- Totals for completed sales in a window. Internal building block.
create or replace function public.chat_sales_totals(p_store_id uuid, p_starts timestamptz, p_ends timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.chat_assert_permission(array['reports.view']);
  if p_store_id is distinct from public.current_user_store_id() then
    raise exception 'You can only view your own store' using errcode = '42501';
  end if;

  with o as (
    select o.*
    from public.orders as o
    where o.store_id = p_store_id
      and o.status = 'Completed'
      and coalesce(o.completed_at, o.created_at) >= p_starts
      and coalesce(o.completed_at, o.created_at) < p_ends
  ),
  items as (
    select
      coalesce(sum(oi.line_total - oi.tax_amount), 0) as net_revenue,
      coalesce(sum(oi.unit_cost * oi.quantity), 0) as cost,
      coalesce(sum(oi.quantity), 0) as units
    from public.order_items as oi
    join o on o.id = oi.order_id
  ),
  refunds as (
    select coalesce(sum(r.refund_amount), 0) as amount, count(*) as cnt
    from public.returns as r
    where r.store_id = p_store_id
      and r.status = 'Completed'
      and r.completed_at >= p_starts
      and r.completed_at < p_ends
  )
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'items_sold', (select units from items),
    'gross_sales', (select coalesce(sum(subtotal), 0) from o),
    'discounts', (select coalesce(sum(discount_amount), 0) from o),
    'tax', (select coalesce(sum(tax_amount), 0) from o),
    'total_sales', (select coalesce(sum(total_amount), 0) from o),
    'average_order_value', (select coalesce(round(avg(total_amount), 2), 0) from o),
    'refunds', (select amount from refunds),
    'refund_count', (select cnt from refunds),
    'net_sales_after_refunds', (select coalesce(sum(total_amount), 0) from o) - (select amount from refunds),
    'revenue_excluding_tax', (select net_revenue from items),
    'cost_of_goods', (select cost from items),
    'estimated_gross_profit', (select net_revenue - cost from items)
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Context
-- ---------------------------------------------------------------------------

create or replace function public.chat_context()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_store_id uuid := public.current_user_store_id();
  v_tz text;
  v_result jsonb;
begin
  if v_store_id is null then
    raise exception 'No active store for this user' using errcode = '42501';
  end if;

  select s.timezone into v_tz from public.stores as s where s.id = v_store_id;
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names as z where z.name = v_tz) then
    v_tz := 'UTC';
  end if;

  select jsonb_build_object(
    'store_name', s.name,
    'store_code', s.code,
    'business_name', b.name,
    'currency', coalesce(nullif(ss.currency, ''), nullif(b.currency, ''), 'LKR'),
    'timezone', v_tz,
    'local_date', to_char(now() at time zone v_tz, 'YYYY-MM-DD'),
    'local_time', to_char(now() at time zone v_tz, 'HH24:MI'),
    'local_weekday', to_char(now() at time zone v_tz, 'FMDay')
  )
  into v_result
  from public.stores as s
  left join public.businesses as b on b.id = s.business_id
  left join public.store_settings as ss on ss.store_id = s.id
  where s.id = v_store_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------

create or replace function public.chat_sales_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cur record;
  v_prev record;
  v_days integer;
  v_payments jsonb;
begin
  perform public.chat_assert_permission(array['reports.view']);
  select * into v_cur from public.chat_period(p_from, p_to);

  v_days := p_to - p_from + 1;
  select * into v_prev from public.chat_period(p_from - v_days, p_from - 1);

  select coalesce(jsonb_agg(jsonb_build_object('method', x.method, 'amount', x.amount, 'count', x.cnt)
                            order by x.amount desc), '[]'::jsonb)
  into v_payments
  from (
    select p.payment_method as method, sum(p.amount) as amount, count(*) as cnt
    from public.payments as p
    join public.orders as o on o.id = p.order_id
    where o.store_id = v_cur.store_id
      and o.status = 'Completed'
      and p.payment_status = 'Completed'
      and coalesce(o.completed_at, o.created_at) >= v_cur.starts_at
      and coalesce(o.completed_at, o.created_at) < v_cur.ends_at
    group by p.payment_method
  ) as x;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days),
    'totals', public.chat_sales_totals(v_cur.store_id, v_cur.starts_at, v_cur.ends_at),
    'payment_methods', v_payments,
    'previous_period', jsonb_build_object(
      'from', p_from - v_days,
      'to', p_from - 1,
      'totals', public.chat_sales_totals(v_prev.store_id, v_prev.starts_at, v_prev.ends_at)
    )
  );
end;
$$;

create or replace function public.chat_sales_by_day(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v record;
  v_result jsonb;
begin
  perform public.chat_assert_permission(array['reports.view']);
  select * into v from public.chat_period(p_from, p_to);

  select coalesce(jsonb_agg(jsonb_build_object(
           'date', d.day,
           'weekday', to_char(d.day, 'FMDay'),
           'orders', coalesce(s.orders, 0),
           'total_sales', coalesce(s.total, 0)
         ) order by d.day), '[]'::jsonb)
  into v_result
  from (select generate_series(p_from, p_to, interval '1 day')::date as day) as d
  left join (
    select (coalesce(o.completed_at, o.created_at) at time zone v.tz)::date as day,
           count(*) as orders,
           sum(o.total_amount) as total
    from public.orders as o
    where o.store_id = v.store_id
      and o.status = 'Completed'
      and coalesce(o.completed_at, o.created_at) >= v.starts_at
      and coalesce(o.completed_at, o.created_at) < v.ends_at
    group by 1
  ) as s on s.day = d.day;

  return jsonb_build_object('period', jsonb_build_object('from', p_from, 'to', p_to), 'days', v_result);
end;
$$;

create or replace function public.chat_top_products(
  p_from date,
  p_to date,
  p_limit integer default 10,
  p_sort_by text default 'quantity'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v record;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_sort text := case when p_sort_by = 'revenue' then 'revenue' else 'quantity' end;
  v_result jsonb;
begin
  perform public.chat_assert_permission(array['reports.view']);
  select * into v from public.chat_period(p_from, p_to);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_result
  from (
    select
      row_number() over (
        order by case when v_sort = 'revenue' then sum(oi.line_total) else sum(oi.quantity) end desc
      ) as rank,
      oi.product_name as product,
      oi.sku,
      sum(oi.quantity) as quantity_sold,
      sum(oi.line_total) as revenue,
      sum(oi.line_total - oi.tax_amount - oi.unit_cost * oi.quantity) as estimated_gross_profit,
      count(distinct oi.order_id) as orders
    from public.order_items as oi
    join public.orders as o on o.id = oi.order_id
    where o.store_id = v.store_id
      and o.status = 'Completed'
      and coalesce(o.completed_at, o.created_at) >= v.starts_at
      and coalesce(o.completed_at, o.created_at) < v.ends_at
    group by oi.product_id, oi.product_name, oi.sku
    order by 1
    limit v_limit
  ) as t;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'sorted_by', v_sort,
    'products', v_result
  );
end;
$$;

create or replace function public.chat_staff_sales(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v record;
  v_result jsonb;
begin
  perform public.chat_assert_permission(array['reports.view']);
  select * into v from public.chat_period(p_from, p_to);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.total_sales desc), '[]'::jsonb)
  into v_result
  from (
    select
      coalesce(u.full_name, 'Unknown staff') as staff_name,
      count(*) as orders,
      sum(o.total_amount) as total_sales,
      round(avg(o.total_amount), 2) as average_order_value
    from public.orders as o
    left join public.users as u on u.id = o.cashier_user_id
    where o.store_id = v.store_id
      and o.status = 'Completed'
      and coalesce(o.completed_at, o.created_at) >= v.starts_at
      and coalesce(o.completed_at, o.created_at) < v.ends_at
    group by o.cashier_user_id, u.full_name
  ) as t;

  return jsonb_build_object('period', jsonb_build_object('from', p_from, 'to', p_to), 'staff', v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- Products & inventory
-- ---------------------------------------------------------------------------

create or replace function public.chat_product_lookup(p_query text, p_limit integer default 10)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
  v_query text := trim(coalesce(p_query, ''));
  v_pattern text;
  v_show_cost boolean;
  v_result jsonb;
begin
  perform public.chat_assert_permission(array['products.view', 'inventory.view', 'pos.use']);
  if length(v_query) < 2 then
    raise exception 'Search text must be at least 2 characters' using errcode = '22023';
  end if;

  v_store_id := public.current_user_store_id();
  v_show_cost := public.has_any_permission(array['products.manage', 'reports.view']);
  v_pattern := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select coalesce(jsonb_agg(t.row_data order by t.exact desc, t.name), '[]'::jsonb)
  into v_result
  from (
    select
      p.name,
      (p.sku = v_query or p.barcode = v_query) as exact,
      jsonb_strip_nulls(jsonb_build_object(
        'name', p.name,
        'sku', p.sku,
        'barcode', p.barcode,
        'category', c.name,
        'supplier', s.name,
        'selling_price', p.selling_price,
        'purchase_price', case when v_show_cost then p.purchase_price end,
        'tax_rate', p.tax_rate,
        'stock_on_hand', coalesce(i.current_stock, 0),
        'stock_reserved', coalesce(i.reserved_stock, 0),
        'stock_available', coalesce(i.current_stock, 0) - coalesce(i.reserved_stock, 0),
        'reorder_level', p.reorder_level,
        'status', p.status
      )) as row_data
    from public.products as p
    left join public.categories as c on c.id = p.category_id
    left join public.suppliers as s on s.id = p.supplier_id
    left join public.inventory as i on i.product_id = p.id and i.store_id = p.store_id
    where p.store_id = v_store_id
      and (p.name ilike v_pattern or p.sku ilike v_pattern or p.barcode = v_query)
    order by 2 desc, p.name
    limit v_limit
  ) as t;

  return jsonb_build_object('query', v_query, 'products', v_result);
end;
$$;

create or replace function public.chat_low_stock(p_limit integer default 20)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_result jsonb;
  v_total integer;
begin
  perform public.chat_assert_permission(array['inventory.view', 'products.view']);
  v_store_id := public.current_user_store_id();

  with low as (
    select
      p.name as product,
      p.sku,
      c.name as category,
      s.name as supplier,
      coalesce(i.current_stock, 0) - coalesce(i.reserved_stock, 0) as available,
      p.reorder_level
    from public.products as p
    left join public.inventory as i on i.product_id = p.id and i.store_id = p.store_id
    left join public.categories as c on c.id = p.category_id
    left join public.suppliers as s on s.id = p.supplier_id
    where p.store_id = v_store_id
      and p.status = 'Active'
      and coalesce(i.current_stock, 0) - coalesce(i.reserved_stock, 0) <= p.reorder_level
  )
  select
    (select count(*) from low),
    coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'product', l.product,
      'sku', l.sku,
      'category', l.category,
      'supplier', l.supplier,
      'stock_available', l.available,
      'reorder_level', l.reorder_level,
      'state', case when l.available <= 0 then 'Out of stock' else 'Low stock' end
    )) order by l.available, l.product), '[]'::jsonb)
  into v_total, v_result
  from (select * from low order by available, product limit v_limit) as l;

  return jsonb_build_object('total_low_or_out', v_total, 'shown', jsonb_array_length(v_result), 'items', v_result);
end;
$$;

create or replace function public.chat_inventory_summary()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_show_cost boolean;
  v_result jsonb;
begin
  perform public.chat_assert_permission(array['inventory.view', 'products.view']);
  v_store_id := public.current_user_store_id();
  v_show_cost := public.has_any_permission(array['products.manage', 'reports.view']);

  select jsonb_strip_nulls(jsonb_build_object(
    'active_products', count(*) filter (where p.status = 'Active'),
    'inactive_products', count(*) filter (where p.status = 'Inactive'),
    'total_units_in_stock', coalesce(sum(i.current_stock) filter (where p.status = 'Active'), 0),
    'out_of_stock_products', count(*) filter (
      where p.status = 'Active' and coalesce(i.current_stock, 0) - coalesce(i.reserved_stock, 0) <= 0),
    'low_stock_products', count(*) filter (
      where p.status = 'Active'
        and coalesce(i.current_stock, 0) - coalesce(i.reserved_stock, 0) > 0
        and coalesce(i.current_stock, 0) - coalesce(i.reserved_stock, 0) <= p.reorder_level),
    'stock_value_at_selling_price', coalesce(sum(greatest(i.current_stock, 0) * p.selling_price)
                                             filter (where p.status = 'Active'), 0),
    'stock_value_at_cost', case when v_show_cost then
      coalesce(sum(greatest(i.current_stock, 0) * p.purchase_price) filter (where p.status = 'Active'), 0) end,
    'categories', (select count(*) from public.categories as c where c.store_id = v_store_id)
  ))
  into v_result
  from public.products as p
  left join public.inventory as i on i.product_id = p.id and i.store_id = p.store_id
  where p.store_id = v_store_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customers (no contact details are ever returned)
-- ---------------------------------------------------------------------------

create or replace function public.chat_customer_lookup(p_query text, p_limit integer default 10)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
  v_query text := trim(coalesce(p_query, ''));
  v_pattern text;
  v_result jsonb;
begin
  perform public.chat_assert_permission(array['customers.view']);
  if length(v_query) < 2 then
    raise exception 'Search text must be at least 2 characters' using errcode = '22023';
  end if;

  v_store_id := public.current_user_store_id();
  v_pattern := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb)
  into v_result
  from (
    select
      c.name,
      c.code,
      c.customer_type,
      c.city,
      c.status,
      count(o.id) as completed_orders,
      coalesce(sum(o.total_amount), 0) as total_spent,
      max(coalesce(o.completed_at, o.created_at))::date as last_purchase_date
    from public.customers as c
    left join public.orders as o
      on o.customer_id = c.id and o.store_id = c.store_id and o.status = 'Completed'
    where c.store_id = v_store_id
      and not c.is_walk_in
      and (c.name ilike v_pattern or c.code ilike v_pattern)
    group by c.id
    order by c.name
    limit v_limit
  ) as t;

  return jsonb_build_object('query', v_query, 'customers', v_result);
end;
$$;

create or replace function public.chat_top_customers(p_from date, p_to date, p_limit integer default 10)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v record;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_result jsonb;
begin
  perform public.chat_assert_permission(array['reports.view']);
  select * into v from public.chat_period(p_from, p_to);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.total_spent desc), '[]'::jsonb)
  into v_result
  from (
    select c.name, c.code, count(*) as orders, sum(o.total_amount) as total_spent
    from public.orders as o
    join public.customers as c on c.id = o.customer_id
    where o.store_id = v.store_id
      and o.status = 'Completed'
      and not c.is_walk_in
      and coalesce(o.completed_at, o.created_at) >= v.starts_at
      and coalesce(o.completed_at, o.created_at) < v.ends_at
    group by c.id, c.name, c.code
    order by sum(o.total_amount) desc
    limit v_limit
  ) as t;

  return jsonb_build_object('period', jsonb_build_object('from', p_from, 'to', p_to), 'customers', v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- Returns
-- ---------------------------------------------------------------------------

create or replace function public.chat_returns_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v record;
  v_by_status jsonb;
  v_by_reason jsonb;
  v_products jsonb;
begin
  perform public.chat_assert_permission(array['returns.view', 'returns.process', 'reports.view']);
  select * into v from public.chat_period(p_from, p_to);

  select coalesce(jsonb_agg(jsonb_build_object('status', x.status, 'count', x.cnt, 'refund_amount', x.amount)
                            order by x.cnt desc), '[]'::jsonb)
  into v_by_status
  from (
    select r.status, count(*) as cnt, sum(r.refund_amount) as amount
    from public.returns as r
    where r.store_id = v.store_id and r.created_at >= v.starts_at and r.created_at < v.ends_at
    group by r.status
  ) as x;

  select coalesce(jsonb_agg(jsonb_build_object('reason', x.reason, 'count', x.cnt) order by x.cnt desc), '[]'::jsonb)
  into v_by_reason
  from (
    select r.reason, count(*) as cnt
    from public.returns as r
    where r.store_id = v.store_id and r.created_at >= v.starts_at and r.created_at < v.ends_at
    group by r.reason
  ) as x;

  select coalesce(jsonb_agg(jsonb_build_object('product', x.product_name, 'quantity_returned', x.qty)
                            order by x.qty desc), '[]'::jsonb)
  into v_products
  from (
    select ri.product_name, sum(ri.quantity) as qty
    from public.return_items as ri
    join public.returns as r on r.id = ri.return_id
    where r.store_id = v.store_id and r.created_at >= v.starts_at and r.created_at < v.ends_at
    group by ri.product_name
    order by 2 desc
    limit 10
  ) as x;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'by_status', v_by_status,
    'by_reason', v_by_reason,
    'most_returned_products', v_products
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Shifts (staff with reports.view see every shift; others see only their own)
-- ---------------------------------------------------------------------------

create or replace function public.chat_shift_summary(p_date date default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v record;
  v_date date;
  v_all boolean;
  v_result jsonb;
begin
  perform public.chat_assert_permission(array['reports.view', 'pos.use']);
  v_all := public.has_permission('reports.view');

  select * into v from public.chat_period(current_date, current_date);
  v_date := coalesce(p_date, (now() at time zone v.tz)::date);
  select * into v from public.chat_period(v_date, v_date);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.opened_at), '[]'::jsonb)
  into v_result
  from (
    select
      r.name as register,
      coalesce(u_open.full_name, 'Unknown staff') as opened_by,
      u_close.full_name as closed_by,
      to_char(s.opened_at at time zone v.tz, 'YYYY-MM-DD HH24:MI') as opened_at,
      to_char(s.closed_at at time zone v.tz, 'YYYY-MM-DD HH24:MI') as closed_at,
      s.status,
      s.opening_cash,
      s.closing_cash,
      coalesce(sales.orders, 0) as orders,
      coalesce(sales.total, 0) as total_sales,
      coalesce(cash.amount, 0) as cash_sales,
      s.opening_cash + coalesce(cash.amount, 0) as expected_cash_before_refunds,
      case when s.closing_cash is not null
           then s.closing_cash - (s.opening_cash + coalesce(cash.amount, 0)) end as cash_difference
    from public.shifts as s
    left join public.registers as r on r.id = s.register_id
    left join public.users as u_open on u_open.id = s.opened_by
    left join public.users as u_close on u_close.id = s.closed_by
    left join lateral (
      select count(*) as orders, sum(o.total_amount) as total
      from public.orders as o
      where o.shift_id = s.id and o.status = 'Completed'
    ) as sales on true
    left join lateral (
      select sum(p.amount) as amount
      from public.payments as p
      join public.orders as o on o.id = p.order_id
      where o.shift_id = s.id and o.status = 'Completed'
        and p.payment_method = 'Cash' and p.payment_status = 'Completed'
    ) as cash on true
    where s.store_id = v.store_id
      and s.opened_at >= v.starts_at
      and s.opened_at < v.ends_at
      and (v_all or s.opened_by = (select auth.uid()))
  ) as t;

  return jsonb_build_object('date', v_date, 'scope', case when v_all then 'all shifts' else 'your shifts' end,
                            'shifts', v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated users only (RLS + permission checks still apply)
-- ---------------------------------------------------------------------------

revoke execute on function public.chat_assert_permission(text[]) from public, anon;
revoke execute on function public.chat_period(date, date) from public, anon;
revoke execute on function public.chat_sales_totals(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.chat_context() from public, anon;
revoke execute on function public.chat_sales_summary(date, date) from public, anon;
revoke execute on function public.chat_sales_by_day(date, date) from public, anon;
revoke execute on function public.chat_top_products(date, date, integer, text) from public, anon;
revoke execute on function public.chat_staff_sales(date, date) from public, anon;
revoke execute on function public.chat_product_lookup(text, integer) from public, anon;
revoke execute on function public.chat_low_stock(integer) from public, anon;
revoke execute on function public.chat_inventory_summary() from public, anon;
revoke execute on function public.chat_customer_lookup(text, integer) from public, anon;
revoke execute on function public.chat_top_customers(date, date, integer) from public, anon;
revoke execute on function public.chat_returns_summary(date, date) from public, anon;
revoke execute on function public.chat_shift_summary(date) from public, anon;

grant execute on function public.chat_assert_permission(text[]) to authenticated;
grant execute on function public.chat_period(date, date) to authenticated;
grant execute on function public.chat_sales_totals(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.chat_context() to authenticated;
grant execute on function public.chat_sales_summary(date, date) to authenticated;
grant execute on function public.chat_sales_by_day(date, date) to authenticated;
grant execute on function public.chat_top_products(date, date, integer, text) to authenticated;
grant execute on function public.chat_staff_sales(date, date) to authenticated;
grant execute on function public.chat_product_lookup(text, integer) to authenticated;
grant execute on function public.chat_low_stock(integer) to authenticated;
grant execute on function public.chat_inventory_summary() to authenticated;
grant execute on function public.chat_customer_lookup(text, integer) to authenticated;
grant execute on function public.chat_top_customers(date, date, integer) to authenticated;
grant execute on function public.chat_returns_summary(date, date) to authenticated;
grant execute on function public.chat_shift_summary(date) to authenticated;
