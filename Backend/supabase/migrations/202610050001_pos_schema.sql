create extension if not exists pgcrypto;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique default ('STORE-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  business_type text not null default 'Retail',
  phone text,
  country text not null default 'Sri Lanka',
  currency char(3) not null default 'USD',
  timezone text not null default 'Asia/Colombo',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  full_name text not null,
  email text not null,
  username text,
  employee_code text,
  phone text,
  role text not null default 'Cashier'
    check (role in ('Admin', 'Administrator', 'Manager', 'Cashier', 'Inventory Clerk', 'Accountant')),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  register_access text,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, email),
  unique (store_id, username),
  unique (store_id, employee_code)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  name text not null,
  contact_person text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  city text not null default '',
  country text not null default '',
  supplier_type text not null default 'Local Supplier',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  name text not null,
  customer_type text not null default 'Individual' check (customer_type in ('Individual', 'Business')),
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  city text not null default '',
  country text not null default '',
  is_walk_in boolean not null default false,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code)
);

create unique index customers_one_walk_in_per_store
  on public.customers (store_id) where is_walk_in;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  name text not null,
  sku text not null,
  barcode text,
  description text not null default '',
  purchase_price numeric(12, 2) not null default 0 check (purchase_price >= 0),
  selling_price numeric(12, 2) not null default 0 check (selling_price >= 0),
  tax_rate numeric(7, 4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  reorder_level numeric(12, 3) not null default 0 check (reorder_level >= 0),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku)
);

create unique index products_unique_barcode_per_store
  on public.products (store_id, barcode) where barcode is not null and barcode <> '';

create table public.product_suppliers (
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_sku text,
  last_purchase_price numeric(12, 2) check (last_purchase_price is null or last_purchase_price >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (product_id, supplier_id)
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(12, 3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (store_id, product_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  user_id uuid references public.user_profiles(id) on delete set null,
  movement_type text not null check (movement_type in ('opening', 'sale', 'return', 'purchase', 'adjustment', 'void')),
  quantity_delta numeric(12, 3) not null check (quantity_delta <> 0),
  reason text not null default '',
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table public.registers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  register_id uuid not null references public.registers(id) on delete restrict,
  opened_by uuid not null references public.user_profiles(id) on delete restrict,
  closed_by uuid references public.user_profiles(id) on delete set null,
  opening_cash numeric(12, 2) not null default 0 check (opening_cash >= 0),
  closing_cash numeric(12, 2) check (closing_cash is null or closing_cash >= 0),
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index one_open_shift_per_register
  on public.shifts (register_id) where status = 'Open';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  register_id uuid references public.registers(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_id uuid not null references public.user_profiles(id) on delete restrict,
  order_number text not null default ('ORD-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  status text not null default 'Completed'
    check (status in ('Draft', 'Held', 'Completed', 'Cancelled', 'Partially Refunded', 'Refunded')),
  currency char(3) not null default 'USD',
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (store_id, order_number)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(7, 4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_method text not null
    check (payment_method in ('Cash', 'Card', 'Bank Transfer', 'Other', 'Store Credit')),
  status text not null default 'Completed' check (status in ('Pending', 'Completed', 'Failed', 'Refunded')),
  amount numeric(12, 2) not null check (amount >= 0),
  tendered_amount numeric(12, 2) not null default 0 check (tendered_amount >= 0),
  change_amount numeric(12, 2) not null default 0 check (change_amount >= 0),
  reference text not null default '',
  processed_by uuid not null references public.user_profiles(id) on delete restrict,
  processed_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_number text not null default ('INV-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  status text not null default 'Issued' check (status in ('Draft', 'Issued', 'Paid', 'Cancelled', 'Refunded')),
  due_date timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, invoice_number)
);

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  processed_by uuid not null references public.user_profiles(id) on delete restrict,
  return_number text not null default ('RET-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Completed', 'Rejected')),
  refund_method text not null default 'Original Payment',
  reason text not null,
  notes text not null default '',
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  refund_amount numeric(12, 2) not null default 0 check (refund_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, return_number)
);

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  return_id uuid not null references public.returns(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  refund_amount numeric(12, 2) not null check (refund_amount >= 0)
);

create table public.user_preferences (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index products_store_name_idx on public.products (store_id, name);
create index products_store_category_idx on public.products (store_id, category_id);
create index inventory_store_product_idx on public.inventory (store_id, product_id);
create index inventory_movements_store_product_time_idx
  on public.inventory_movements (store_id, product_id, created_at desc);
create index orders_store_created_idx on public.orders (store_id, created_at desc);
create index orders_store_customer_idx on public.orders (store_id, customer_id);
create index order_items_order_idx on public.order_items (order_id);
create index payments_order_idx on public.payments (order_id);
create index returns_store_created_idx on public.returns (store_id, created_at desc);
create index activity_logs_store_created_idx on public.activity_logs (store_id, created_at desc);

create or replace function public.current_store_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select up.store_id
  from public.user_profiles as up
  where up.id = (select auth.uid())
    and up.status = 'Active'
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select up.role
  from public.user_profiles as up
  where up.id = (select auth.uid())
    and up.status = 'Active'
$$;

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('Admin', 'Administrator'), false)
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_store_id uuid;
  business_name text;
  requested_role text;
begin
  if nullif(new.raw_app_meta_data ->> 'store_id', '') is not null then
    new_store_id := (new.raw_app_meta_data ->> 'store_id')::uuid;
    requested_role := coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'Cashier');
    if requested_role not in ('Manager', 'Cashier', 'Inventory Clerk', 'Accountant') then
      raise exception 'The requested staff role is not permitted';
    end if;
    if not exists (select 1 from public.stores where id = new_store_id and status = 'Active') then
      raise exception 'The requested store is unavailable';
    end if;

    insert into public.user_profiles (
      id, store_id, full_name, email, username, employee_code, phone, role, register_access
    )
    values (
      new.id,
      new_store_id,
      coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
      new.email,
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(new.raw_app_meta_data ->> 'employee_code', ''),
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      requested_role,
      nullif(new.raw_app_meta_data ->> 'register_access', '')
    );
    return new;
  end if;

  business_name := coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''), split_part(new.email, '@', 1) || '''s Store');

  insert into public.stores (name, business_type, phone, country, currency)
  values (
    business_name,
    coalesce(nullif(new.raw_user_meta_data ->> 'business_type', ''), 'Retail'),
    coalesce(new.raw_user_meta_data ->> 'business_phone', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'country', ''), 'Sri Lanka'),
    coalesce(nullif(new.raw_user_meta_data ->> 'currency', ''), 'USD')
  )
  returning id into new_store_id;

  insert into public.user_profiles (id, store_id, full_name, email, username, role, phone)
  values (
    new.id,
    new_store_id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
    new.email,
    nullif(new.raw_user_meta_data ->> 'username', ''),
    'Admin',
    coalesce(new.raw_user_meta_data ->> 'business_phone', '')
  );

  insert into public.registers (store_id, name)
  values (new_store_id, 'Register #01');

  insert into public.customers (store_id, code, name, customer_type, is_walk_in)
  values (new_store_id, 'CUS-001', 'Walk-in Customer', 'Individual', true);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.create_product_inventory()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.inventory (store_id, product_id, quantity)
  values (new.store_id, new.id, 0);
  return new;
end;
$$;

create trigger products_create_inventory
  after insert on public.products
  for each row execute function public.create_product_inventory();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'stores', 'user_profiles', 'categories', 'suppliers', 'customers', 'products',
    'product_suppliers', 'inventory', 'inventory_movements', 'registers', 'shifts',
    'orders', 'order_items', 'payments', 'invoices', 'returns', 'return_items',
    'user_preferences', 'activity_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

create policy "members can read their store" on public.stores
  for select to authenticated using (id = (select public.current_store_id()));
create policy "store admins can update their store" on public.stores
  for update to authenticated using (id = (select public.current_store_id()) and (select public.is_store_admin()))
  with check (id = (select public.current_store_id()) and (select public.is_store_admin()));

create policy "members can read store profiles" on public.user_profiles
  for select to authenticated using (store_id = (select public.current_store_id()));
create policy "users can update their own profile" on public.user_profiles
  for update to authenticated using (id = (select auth.uid()) and store_id = (select public.current_store_id()))
  with check (id = (select auth.uid()) and store_id = (select public.current_store_id()));
create policy "store admins can manage staff profiles" on public.user_profiles
  for update to authenticated using (
    store_id = (select public.current_store_id()) and (select public.is_store_admin())
  )
  with check (
    store_id = (select public.current_store_id()) and (select public.is_store_admin())
  );

create policy "users can read own preferences" on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users can manage own preferences" on public.user_preferences
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'categories', 'suppliers', 'customers', 'products', 'inventory',
    'registers', 'shifts', 'orders', 'order_items',
    'payments', 'invoices', 'returns', 'return_items'
  ]
  loop
    execute format(
      'create policy "store members can access rows" on public.%I for all to authenticated using (store_id = (select public.current_store_id())) with check (store_id = (select public.current_store_id()))',
      table_name
    );
  end loop;
end;
$$;

create policy "members can read store inventory movements" on public.inventory_movements
  for select to authenticated using (store_id = (select public.current_store_id()));
create policy "members can record own inventory movements" on public.inventory_movements
  for insert to authenticated with check (
    store_id = (select public.current_store_id())
    and user_id = (select auth.uid())
  );

create policy "members can read store activity logs" on public.activity_logs
  for select to authenticated using (store_id = (select public.current_store_id()));
create policy "members can record own activity" on public.activity_logs
  for insert to authenticated with check (
    store_id = (select public.current_store_id())
    and user_id = (select auth.uid())
  );

create policy "store members can access product suppliers" on public.product_suppliers
  for all to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_suppliers.product_id
        and p.store_id = (select public.current_store_id())
    )
    and exists (
      select 1 from public.suppliers s
      where s.id = product_suppliers.supplier_id
        and s.store_id = (select public.current_store_id())
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_suppliers.product_id
        and p.store_id = (select public.current_store_id())
    )
    and exists (
      select 1 from public.suppliers s
      where s.id = product_suppliers.supplier_id
        and s.store_id = (select public.current_store_id())
    )
  );

create or replace function public.complete_pos_sale(
  p_customer_id uuid,
  p_register_id uuid,
  p_items jsonb,
  p_discount_amount numeric default 0,
  p_payment_method text default 'Cash',
  p_tendered_amount numeric default 0,
  p_payment_reference text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store_id uuid := (select public.current_store_id());
  cashier_id uuid := (select auth.uid());
  new_order_id uuid;
  new_order_number text;
  new_invoice_number text;
  item jsonb;
  product_row public.products%rowtype;
  item_quantity numeric(12, 3);
  item_subtotal numeric(12, 2);
  item_discount numeric(12, 2);
  item_tax numeric(12, 2);
  sale_subtotal numeric(12, 2) := 0;
  sale_tax numeric(12, 2) := 0;
  sale_discount numeric(12, 2);
  sale_total numeric(12, 2);
  item_count integer := 0;
  payment_status text := 'Completed';
begin
  if v_store_id is null then
    raise exception 'A signed-in store profile is required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale must contain at least one item';
  end if;
  if p_payment_method not in ('Cash', 'Card', 'Bank Transfer', 'Other', 'Store Credit') then
    raise exception 'Unsupported payment method';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_count := item_count + 1;
    item_quantity := (item ->> 'quantity')::numeric;
    if item_quantity <= 0 then
      raise exception 'Item quantities must be greater than zero';
    end if;
    select * into product_row
    from public.products
    where id = (item ->> 'product_id')::uuid
      and products.store_id = v_store_id
      and products.status = 'Active'
    for update;
    if not found then
      raise exception 'A product is unavailable in this store';
    end if;

    perform 1 from public.inventory
    where inventory.product_id = product_row.id
      and inventory.store_id = v_store_id
      and quantity >= item_quantity
    for update;
    if not found then
      raise exception 'Insufficient stock for %', product_row.name;
    end if;

    item_subtotal := round(product_row.selling_price * item_quantity, 2);
    sale_subtotal := sale_subtotal + item_subtotal;
  end loop;

  sale_discount := round(coalesce(p_discount_amount, 0), 2);
  if sale_discount < 0 or sale_discount > sale_subtotal then
    raise exception 'Discount is outside the permitted range';
  end if;

  if not exists (
    select 1 from public.registers
    where registers.id = p_register_id and registers.store_id = v_store_id and registers.status = 'Active'
  ) then
    raise exception 'Register is unavailable in this store';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers
    where customers.id = p_customer_id and customers.store_id = v_store_id and customers.status = 'Active'
  ) then
    raise exception 'Customer is unavailable in this store';
  end if;

  new_order_number := 'ORD-' || upper(substr(gen_random_uuid()::text, 1, 8));

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_quantity := (item ->> 'quantity')::numeric;
    select * into product_row
    from public.products
    where products.id = (item ->> 'product_id')::uuid
      and products.store_id = v_store_id;
    item_subtotal := round(product_row.selling_price * item_quantity, 2);
    item_discount := case
      when sale_subtotal = 0 then 0
      else round(sale_discount * item_subtotal / sale_subtotal, 2)
    end;
    item_tax := round((item_subtotal - item_discount) * product_row.tax_rate / 100, 2);
    sale_tax := sale_tax + item_tax;
  end loop;

  sale_total := sale_subtotal - sale_discount + sale_tax;
  if p_payment_method = 'Cash' and coalesce(p_tendered_amount, 0) < sale_total then
    raise exception 'Cash tendered is less than the sale total';
  end if;

  insert into public.orders (
    store_id, register_id, customer_id, cashier_id, order_number,
    subtotal, discount_amount, tax_amount, total_amount, status, completed_at
  )
  values (
    v_store_id, p_register_id, p_customer_id, cashier_id, new_order_number,
    sale_subtotal, sale_discount, sale_tax, sale_total, 'Completed', now()
  )
  returning id into new_order_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_quantity := (item ->> 'quantity')::numeric;
    select * into product_row
    from public.products
    where products.id = (item ->> 'product_id')::uuid and products.store_id = v_store_id;
    item_subtotal := round(product_row.selling_price * item_quantity, 2);
    item_discount := case
      when sale_subtotal = 0 then 0
      else round(sale_discount * item_subtotal / sale_subtotal, 2)
    end;
    item_tax := round((item_subtotal - item_discount) * product_row.tax_rate / 100, 2);

    insert into public.order_items (
      store_id, order_id, product_id, product_name, sku, quantity,
      unit_price, discount_amount, tax_rate, tax_amount, line_total
    )
    values (
      v_store_id, new_order_id, product_row.id, product_row.name, product_row.sku,
      item_quantity, product_row.selling_price, item_discount, product_row.tax_rate,
      item_tax, item_subtotal - item_discount + item_tax
    );

    update public.inventory
    set quantity = quantity - item_quantity, updated_at = now()
    where product_id = product_row.id and inventory.store_id = v_store_id;

    insert into public.inventory_movements (
      store_id, product_id, user_id, movement_type, quantity_delta, reference_type, reference_id
    )
    values (v_store_id, product_row.id, cashier_id, 'sale', -item_quantity, 'order', new_order_id);
  end loop;

  insert into public.payments (
    store_id, order_id, payment_method, amount, tendered_amount, change_amount,
    reference, processed_by
  )
  values (
    v_store_id, new_order_id, p_payment_method, sale_total,
    coalesce(p_tendered_amount, sale_total),
    greatest(coalesce(p_tendered_amount, sale_total) - sale_total, 0),
    coalesce(p_payment_reference, ''), cashier_id
  );

  new_invoice_number := 'INV-' || upper(substr(gen_random_uuid()::text, 1, 8));
  insert into public.invoices (store_id, order_id, customer_id, invoice_number, status)
  values (v_store_id, new_order_id, p_customer_id, new_invoice_number, 'Paid');

  return jsonb_build_object(
    'order_id', new_order_id,
    'order_number', new_order_number,
    'invoice_number', new_invoice_number,
    'subtotal', sale_subtotal,
    'discount_amount', sale_discount,
    'tax_amount', sale_tax,
    'total_amount', sale_total,
    'item_count', item_count,
    'payment_status', payment_status
  );
end;
$$;

create or replace function public.complete_pos_return(p_return_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store_id uuid := (select public.current_store_id());
  v_return public.returns%rowtype;
  v_item public.return_items%rowtype;
begin
  select * into v_return
  from public.returns
  where id = p_return_id and store_id = v_store_id
  for update;
  if not found then
    raise exception 'Return was not found in this store';
  end if;
  if v_return.status <> 'Approved' then
    raise exception 'Only approved returns can be completed';
  end if;

  for v_item in
    select * from public.return_items
    where return_id = p_return_id and store_id = v_store_id
      and product_id is not null
  loop
    update public.inventory
    set quantity = quantity + v_item.quantity, updated_at = now()
    where product_id = v_item.product_id and store_id = v_store_id;

    insert into public.inventory_movements (
      store_id, product_id, user_id, movement_type, quantity_delta, reason,
      reference_type, reference_id
    )
    values (
      v_store_id, v_item.product_id, (select auth.uid()), 'return',
      v_item.quantity, 'Approved customer return', 'return', p_return_id
    );
  end loop;

  update public.returns
  set status = 'Completed', updated_at = now()
  where id = p_return_id and store_id = v_store_id;
end;
$$;

revoke all on function public.current_store_id() from public, anon;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_store_admin() from public, anon;
revoke all on function public.complete_pos_sale(uuid, uuid, jsonb, numeric, text, numeric, text) from public, anon;
revoke all on function public.complete_pos_return(uuid) from public, anon;
grant execute on function public.current_store_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_store_admin() to authenticated;
grant execute on function public.complete_pos_sale(uuid, uuid, jsonb, numeric, text, numeric, text) to authenticated;
grant execute on function public.complete_pos_return(uuid) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update on public.user_profiles from authenticated;
grant update (full_name, email, username, phone, last_login, employee_code, role, status, register_access)
  on public.user_profiles to authenticated;
