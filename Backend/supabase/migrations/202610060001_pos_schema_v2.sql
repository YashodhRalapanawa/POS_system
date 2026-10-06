-- POS schema v2
--
-- Built from POS_Database_Architecture.pdf and "POS Database Architecture — Frontend Gap Review"
-- (2026-10-05), and matched to the mock data and forms in Frontend/src.
--
-- Answers assumed for the review's open questions:
--   * Tenant model: businesses -> stores. Sign-up creates one business with one store. Codes and
--     document numbers are unique per store, so more stores can be added later.
--   * Roles: Admin, Manager, Cashier with the 19 permission keys in Frontend/src/auth/permissions.js.
--     Roles are rows, so more can be added without a schema change.
--   * Every invoice belongs to one order.
--   * Returns restock per item (return_items.restock) when the return is completed.
--   * One tax rate per product; store_settings.prices_include_tax sets inclusive pricing.
--   * Username sign-in is resolved by get_login_email(), callable by the service role only.
--
-- The draft tables from 202610050001_pos_schema.sql are moved to schema legacy_v1 (not dropped) and
-- their master data is copied into the new tables at the end of this file.

-- ---------------------------------------------------------------------------
-- 0. Move the draft schema out of the way
-- ---------------------------------------------------------------------------

create schema if not exists legacy_v1;
revoke all on schema legacy_v1 from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.complete_pos_sale(uuid, uuid, jsonb, numeric, text, numeric, text);
drop function if exists public.complete_pos_return(uuid);
drop function if exists public.handle_new_auth_user();
drop function if exists public.create_product_inventory() cascade;
drop function if exists public.update_updated_at() cascade;
drop function if exists public.is_store_admin() cascade;
drop function if exists public.current_user_role() cascade;
drop function if exists public.current_store_id() cascade;

do $$
declare
  t text;
begin
  foreach t in array array[
    'stores', 'user_profiles', 'categories', 'suppliers', 'customers', 'products',
    'product_suppliers', 'inventory', 'inventory_movements', 'registers', 'shifts',
    'orders', 'order_items', 'payments', 'invoices', 'returns', 'return_items',
    'user_preferences', 'activity_logs'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I set schema legacy_v1', t);
    end if;
  end loop;
end;
$$;

revoke all on all tables in schema legacy_v1 from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Tenants, roles and staff
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  business_type text not null default 'Retail'
    check (business_type in ('Retail', 'Electronics', 'Grocery', 'Pharmacy', 'Restaurant', 'Other')),
  phone text not null default '',
  country text not null default 'Sri Lanka',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  owner_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  code text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  city text not null default '',
  country text not null default 'Sri Lanka',
  timezone text not null default 'Asia/Colombo',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create table public.roles (
  id smallint generated always as identity primary key,
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.permissions (
  id smallint generated always as identity primary key,
  key text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id smallint not null references public.roles (id) on delete cascade,
  permission_id smallint not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Staff profile. Credentials live in Supabase Auth; users.id = auth.users.id.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  role_id smallint not null references public.roles (id) on delete restrict,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,
  username text check (username is null or username ~ '^[A-Za-z0-9_]{4,20}$'),
  employee_code text,
  phone text not null default '',
  avatar_url text,
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Locked')),
  all_registers boolean not null default false,
  failed_login_count integer not null default 0 check (failed_login_count >= 0),
  locked_until timestamptz,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, employee_code)
);

create unique index users_email_key on public.users (lower(email));
create unique index users_username_key on public.users (lower(username)) where username is not null;

create table public.user_preferences (
  user_id uuid primary key references public.users (id) on delete cascade,
  landing_page text not null default '/dashboard',
  date_format text not null default 'MMM D, YYYY'
    check (date_format in ('MMM D, YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD')),
  ask_before_printing boolean not null default true,
  sale_sound boolean not null default true,
  table_density text not null default 'comfortable' check (table_density in ('comfortable', 'compact')),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Registers and store settings
-- ---------------------------------------------------------------------------

create table public.registers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name),
  unique (id, store_id)
);

-- Register access from the Users screen. users.all_registers covers "All Registers".
create table public.user_register_access (
  user_id uuid not null references public.users (id) on delete cascade,
  register_id uuid not null references public.registers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, register_id)
);

-- One row per store; mirrors the Settings screen (Frontend/src/data/mockSettings.js).
-- Store name, code, contact details and timezone live on stores.
create table public.store_settings (
  store_id uuid primary key references public.stores (id) on delete cascade,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  default_register_id uuid,
  default_receipt_printer text not null default 'Main Receipt Printer',
  allow_negative_stock boolean not null default false,
  require_customer_for_sale boolean not null default false,
  enable_cash_drawer boolean not null default true,
  auto_lock_register boolean not null default true,
  auto_lock_after_minutes integer not null default 15 check (auto_lock_after_minutes between 1 and 240),

  default_tax_rate numeric(5, 2) not null default 15 check (default_tax_rate between 0 and 100),
  prices_include_tax boolean not null default false,
  allow_line_discounts boolean not null default true,
  maximum_discount numeric(5, 2) not null default 20 check (maximum_discount between 0 and 100),
  require_manager_approval_above numeric(5, 2) not null default 10
    check (require_manager_approval_above between 0 and 100),

  invoice_prefix text not null default 'INV-',
  next_invoice_number integer not null default 1001 check (next_invoice_number > 0),
  order_prefix text not null default 'ORD-',
  next_order_number integer not null default 1001 check (next_order_number > 0),
  return_prefix text not null default 'RET-',
  next_return_number integer not null default 1001 check (next_return_number > 0),
  receipt_footer text not null default 'Thank you for shopping with us.',
  show_store_address boolean not null default true,
  show_cashier_name boolean not null default true,
  show_tax_breakdown boolean not null default true,
  auto_generate_invoice boolean not null default true,

  low_stock_alerts boolean not null default true,
  out_of_stock_alerts boolean not null default true,
  pending_payment_alerts boolean not null default true,
  return_approval_alerts boolean not null default true,
  daily_sales_summary boolean not null default true,

  date_format text not null default 'MMM DD, YYYY',
  time_format text not null default '12-hour' check (time_format in ('12-hour', '24-hour')),
  language text not null default 'English',
  theme text not null default 'Vantrix Blue',
  compact_table_mode boolean not null default false,

  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (default_register_id, store_id)
    references public.registers (id, store_id) on delete set null (default_register_id)
);

-- ---------------------------------------------------------------------------
-- 3. Catalogue
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id)
);

create unique index categories_store_name_key on public.categories (store_id, lower(name));

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  code text not null,
  name text not null check (length(trim(name)) > 0),
  contact_person text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  city text not null default '',
  country text not null default '',
  supplier_type text not null default 'Local Supplier'
    check (supplier_type in ('Manufacturer', 'Distributor', 'Wholesaler', 'Local Supplier')),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code),
  unique (id, store_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  code text not null,
  name text not null check (length(trim(name)) > 0),
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
  unique (store_id, code),
  unique (id, store_id)
);

create unique index customers_one_walk_in_per_store on public.customers (store_id) where is_walk_in;

-- Stock status (In Stock / Low Stock / Out of Stock) is derived; see inventory_overview.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  category_id uuid,
  supplier_id uuid,
  sku text not null,
  barcode text,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  purchase_price numeric(12, 2) not null default 0 check (purchase_price >= 0),
  selling_price numeric(12, 2) not null default 0 check (selling_price >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku),
  unique (id, store_id),
  foreign key (category_id, store_id)
    references public.categories (id, store_id) on delete set null (category_id),
  foreign key (supplier_id, store_id)
    references public.suppliers (id, store_id) on delete set null (supplier_id)
);

create unique index products_store_barcode_key
  on public.products (store_id, barcode) where barcode is not null and barcode <> '';

-- ---------------------------------------------------------------------------
-- 4. Inventory. Stock changes only through stock_movements (see apply_stock_movement).
-- ---------------------------------------------------------------------------

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null unique,
  current_stock integer not null default 0,
  reserved_stock integer not null default 0 check (reserved_stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, store_id) references public.products (id, store_id) on delete cascade
);

-- quantity is what the user entered (the new level for 'Set Stock Level');
-- quantity_change, quantity_before and quantity_after are filled in by the trigger.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  adjustment_type text not null
    check (adjustment_type in ('Add Stock', 'Remove Stock', 'Set Stock Level', 'Sale', 'Return', 'Received')),
  reason text
    check (reason is null or reason in ('Stock Count', 'Damaged', 'Lost', 'Found', 'Manual Correction', 'Other')),
  quantity integer not null check (quantity >= 0),
  quantity_change integer not null default 0,
  quantity_before integer not null default 0,
  quantity_after integer not null default 0,
  reference_type text check (reference_type is null or reference_type in ('order', 'return', 'adjustment', 'purchase')),
  reference_id uuid,
  notes text not null default '',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (product_id, store_id) references public.products (id, store_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- 5. Register sessions and sales
-- ---------------------------------------------------------------------------

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  register_id uuid not null,
  opened_by uuid not null references public.users (id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_by uuid references public.users (id) on delete restrict,
  closed_at timestamptz,
  opening_cash numeric(12, 2) not null default 0 check (opening_cash >= 0),
  closing_cash numeric(12, 2) check (closing_cash is null or closing_cash >= 0),
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (register_id, store_id) references public.registers (id, store_id) on delete restrict,
  check ((status = 'Closed') = (closed_at is not null))
);

create unique index shifts_one_open_per_register on public.shifts (register_id) where status = 'Open';

-- Payment method and payment status are derived from payments (see order_summaries).
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  register_id uuid,
  shift_id uuid references public.shifts (id) on delete set null,
  customer_id uuid,
  cashier_user_id uuid not null references public.users (id) on delete restrict,
  order_number text not null,
  status text not null default 'Pending'
    check (status in ('Held', 'Pending', 'Completed', 'Cancelled', 'Refunded')),
  discount_type text check (discount_type is null or discount_type in ('percent', 'fixed')),
  discount_value numeric(12, 2) not null default 0 check (discount_value >= 0),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (store_id, order_number),
  unique (id, store_id),
  foreign key (register_id, store_id) references public.registers (id, store_id) on delete restrict,
  foreign key (customer_id, store_id) references public.customers (id, store_id) on delete restrict,
  check (discount_type is distinct from 'percent' or discount_value <= 100)
);

-- product_name and sku are copied at sale time so history survives renames.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  unique (id, store_id),
  foreign key (order_id, store_id) references public.orders (id, store_id) on delete cascade,
  foreign key (product_id, store_id) references public.products (id, store_id) on delete restrict
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  payment_method text not null check (payment_method in ('Cash', 'Card', 'Bank Transfer', 'Other')),
  payment_status text not null default 'Completed'
    check (payment_status in ('Pending', 'Completed', 'Failed', 'Refunded')),
  amount numeric(12, 2) not null check (amount >= 0),
  tendered_amount numeric(12, 2) not null default 0 check (tendered_amount >= 0),
  change_amount numeric(12, 2) not null default 0 check (change_amount >= 0),
  reference text not null default '',
  processed_by uuid not null references public.users (id) on delete restrict,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (order_id, store_id) references public.orders (id, store_id) on delete restrict
);

-- Customer details are copied when the invoice is issued.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null unique,
  customer_id uuid,
  invoice_number text not null,
  invoice_date timestamptz not null default now(),
  due_date timestamptz,
  customer_name text not null default '',
  customer_code text not null default '',
  customer_type text check (customer_type is null or customer_type in ('Individual', 'Business')),
  customer_phone text not null default '',
  customer_email text not null default '',
  customer_address text not null default '',
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  status text not null default 'Pending'
    check (status in ('Paid', 'Pending', 'Overdue', 'Cancelled', 'Refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, invoice_number),
  foreign key (order_id, store_id) references public.orders (id, store_id) on delete restrict,
  foreign key (customer_id, store_id) references public.customers (id, store_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- 6. Returns: Pending -> Approved -> Completed, or Rejected (see guard_return_update)
-- ---------------------------------------------------------------------------

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  customer_id uuid,
  return_number text not null,
  reason text not null
    check (reason in ('Damaged', 'Defective', 'Wrong Item', 'Customer Changed Mind', 'Incorrect Quantity', 'Other')),
  notes text not null default '',
  refund_method text not null default 'Original Payment'
    check (refund_method in ('Original Payment', 'Cash', 'Card', 'Store Credit')),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  refund_amount numeric(12, 2) not null default 0 check (refund_amount >= 0),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Completed', 'Rejected')),
  requested_by uuid not null references public.users (id) on delete restrict,
  approved_by uuid references public.users (id) on delete restrict,
  approved_at timestamptz,
  processed_by uuid references public.users (id) on delete restrict,
  completed_at timestamptz,
  rejected_by uuid references public.users (id) on delete restrict,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, return_number),
  unique (id, store_id),
  foreign key (order_id, store_id) references public.orders (id, store_id) on delete restrict,
  foreign key (customer_id, store_id) references public.customers (id, store_id) on delete restrict,
  check (status <> 'Rejected' or rejection_reason is not null)
);

-- refund_amount is before tax; tax_amount is the matching share of the sale's tax.
-- restock defaults to false for Damaged/Defective returns, true otherwise.
create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  return_id uuid not null,
  order_item_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  refund_amount numeric(12, 2) not null check (refund_amount >= 0),
  restock boolean not null,
  created_at timestamptz not null default now(),
  foreign key (return_id, store_id) references public.returns (id, store_id) on delete cascade,
  foreign key (order_item_id, store_id) references public.order_items (id, store_id) on delete restrict,
  foreign key (product_id, store_id) references public.products (id, store_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- 7. Activity log (My Profile > Security activity, and audit)
-- ---------------------------------------------------------------------------

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  entity_type text not null default 'user',
  entity_id uuid,
  action text not null check (action in (
    'Signed in', 'Signed out', 'Failed sign-in attempt', 'Password changed', 'Profile updated',
    'Created', 'Updated', 'Deleted', 'Status changed'
  )),
  description text not null default '',
  details jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. Indexes
-- ---------------------------------------------------------------------------

create index users_store_idx on public.users (store_id);
create index users_role_idx on public.users (role_id);
create index stores_business_idx on public.stores (business_id);
create index user_register_access_register_idx on public.user_register_access (register_id);
create index products_store_name_idx on public.products (store_id, name);
create index products_category_idx on public.products (category_id);
create index products_supplier_idx on public.products (supplier_id);
create index stock_movements_product_time_idx on public.stock_movements (store_id, product_id, created_at desc);
create index stock_movements_created_by_idx on public.stock_movements (created_by);
create index shifts_register_time_idx on public.shifts (register_id, opened_at desc);
create index orders_store_time_idx on public.orders (store_id, created_at desc);
create index orders_store_status_idx on public.orders (store_id, status);
create index orders_customer_idx on public.orders (customer_id);
create index orders_cashier_idx on public.orders (cashier_user_id);
create index orders_shift_idx on public.orders (shift_id);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
create index payments_order_idx on public.payments (order_id);
create index invoices_store_date_idx on public.invoices (store_id, invoice_date desc);
create index invoices_customer_idx on public.invoices (customer_id);
create index returns_store_status_idx on public.returns (store_id, status);
create index returns_store_time_idx on public.returns (store_id, created_at desc);
create index returns_order_idx on public.returns (order_id);
create index return_items_return_idx on public.return_items (return_id);
create index return_items_order_item_idx on public.return_items (order_item_id);
create index activity_logs_store_time_idx on public.activity_logs (store_id, created_at desc);
create index activity_logs_user_time_idx on public.activity_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. Roles and permissions (matrix from Frontend/src/auth/permissions.js)
-- ---------------------------------------------------------------------------

insert into public.roles (name, description) values
  ('Admin', 'Full access, including staff accounts and store settings'),
  ('Manager', 'Runs the store: catalogue, stock, customers, returns and reports'),
  ('Cashier', 'Uses the POS and views customers, orders, invoices and returns');

insert into public.permissions (key, description) values
  ('dashboard.view', 'View the dashboard'),
  ('pos.use', 'Use the POS register'),
  ('products.view', 'View products'),
  ('products.manage', 'Create, edit and deactivate products'),
  ('categories.view', 'View categories'),
  ('categories.manage', 'Create, edit and deactivate categories'),
  ('suppliers.view', 'View suppliers'),
  ('suppliers.manage', 'Create, edit and deactivate suppliers'),
  ('inventory.view', 'View stock levels and movements'),
  ('inventory.manage', 'Adjust stock levels'),
  ('customers.view', 'View customers'),
  ('customers.manage', 'Create, edit and deactivate customers'),
  ('orders.view', 'View orders'),
  ('invoices.view', 'View invoices'),
  ('returns.view', 'View returns and request new ones'),
  ('returns.process', 'Approve, reject and complete returns'),
  ('reports.view', 'View reports'),
  ('users.manage', 'Manage staff accounts'),
  ('settings.manage', 'Change store settings');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where r.name = 'Admin'
   or (r.name = 'Manager' and p.key not in ('users.manage', 'settings.manage'))
   or (r.name = 'Cashier' and p.key in (
        'dashboard.view', 'pos.use', 'customers.view', 'orders.view', 'invoices.view', 'returns.view'));

-- ---------------------------------------------------------------------------
-- 10. Helper functions
-- ---------------------------------------------------------------------------

create function public.current_user_store_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.store_id from public.users as u
  where u.id = (select auth.uid()) and u.status = 'Active'
$$;

create function public.current_user_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.business_id from public.users as u
  where u.id = (select auth.uid()) and u.status = 'Active'
$$;

create function public.has_any_permission(p_keys text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users as u
    join public.role_permissions as rp on rp.role_id = u.role_id
    join public.permissions as p on p.id = rp.permission_id
    where u.id = (select auth.uid())
      and u.status = 'Active'
      and p.key = any (p_keys)
  )
$$;

create function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_any_permission(array[p_key])
$$;

-- The signed-in user's permission keys, so the frontend can replace its local matrix.
create function public.current_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.key order by p.key), '{}')
  from public.users as u
  join public.role_permissions as rp on rp.role_id = u.role_id
  join public.permissions as p on p.id = rp.permission_id
  where u.id = (select auth.uid()) and u.status = 'Active'
$$;

create function public.request_header(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return current_setting('request.headers', true)::json ->> p_name;
exception when others then
  return null;
end;
$$;

create function public.request_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(trim(split_part(coalesce(public.request_header('x-forwarded-for'), ''), ',', 1)), '')::inet;
exception when others then
  return null;
end;
$$;

-- Per-store document numbers from store_settings (row lock keeps them gap-free per store).
create function public.next_document_number(p_store_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  if p_kind = 'order' then
    update public.store_settings set next_order_number = next_order_number + 1
    where store_id = p_store_id
    returning order_prefix || (next_order_number - 1) into v_number;
  elsif p_kind = 'invoice' then
    update public.store_settings set next_invoice_number = next_invoice_number + 1
    where store_id = p_store_id
    returning invoice_prefix || (next_invoice_number - 1) into v_number;
  elsif p_kind = 'return' then
    update public.store_settings set next_return_number = next_return_number + 1
    where store_id = p_store_id
    returning return_prefix || (next_return_number - 1) into v_number;
  else
    raise exception 'Unknown document kind %', p_kind;
  end if;

  if v_number is null then
    raise exception 'Store settings are missing for store %', p_store_id;
  end if;
  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Trigger functions
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.assign_document_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'orders' then
    if new.order_number is null then
      new.order_number := public.next_document_number(new.store_id, 'order');
    end if;
  elsif tg_table_name = 'invoices' then
    if new.invoice_number is null then
      new.invoice_number := public.next_document_number(new.store_id, 'invoice');
    end if;
  elsif tg_table_name = 'returns' then
    if new.return_number is null then
      new.return_number := public.next_document_number(new.store_id, 'return');
    end if;
  end if;
  return new;
end;
$$;

create function public.create_inventory_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory (store_id, product_id)
  values (new.store_id, new.id)
  on conflict (product_id) do nothing;
  return new;
end;
$$;

-- The single place stock changes: locks the inventory row, records before/after, applies the change.
create function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_allow_negative boolean;
begin
  select i.current_stock into v_before
  from public.inventory as i
  where i.product_id = new.product_id and i.store_id = new.store_id
  for update;

  if not found then
    insert into public.inventory (store_id, product_id) values (new.store_id, new.product_id);
    v_before := 0;
  end if;

  if new.adjustment_type <> 'Set Stock Level' and new.quantity = 0 then
    raise exception 'Quantity must be greater than zero' using errcode = 'check_violation';
  end if;

  new.quantity_change := case new.adjustment_type
    when 'Add Stock' then new.quantity
    when 'Received' then new.quantity
    when 'Return' then new.quantity
    when 'Remove Stock' then -new.quantity
    when 'Sale' then -new.quantity
    when 'Set Stock Level' then new.quantity - v_before
  end;
  new.quantity_before := v_before;
  new.quantity_after := v_before + new.quantity_change;

  if new.quantity_after < 0 then
    select s.allow_negative_stock into v_allow_negative
    from public.store_settings as s where s.store_id = new.store_id;
    if not coalesce(v_allow_negative, false) then
      raise exception 'Not enough stock: % available, % requested', v_before, new.quantity
        using errcode = 'check_violation';
    end if;
  end if;

  new.created_by := coalesce((select auth.uid()), new.created_by);
  new.created_at := now();

  update public.inventory
  set current_stock = new.quantity_after, updated_at = now()
  where product_id = new.product_id and store_id = new.store_id;

  return new;
end;
$$;

-- Staff can edit their own name, phone and photo; users.manage can edit others in the store.
-- Email comes from Supabase Auth (sync_auth_user_email); sign-in fields are system-maintained.
create function public.guard_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean;
begin
  if pg_trigger_depth() > 1 or v_uid is null or current_setting('pos.trusted_update', true) = 'on' then
    return new;
  end if;

  if new.id <> old.id or new.business_id <> old.business_id or new.store_id <> old.store_id then
    raise exception 'A staff account cannot be moved to another business or store' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'Change the email address through Supabase Auth; it is copied here automatically'
      using errcode = '42501';
  end if;
  if new.failed_login_count <> old.failed_login_count
     or new.locked_until is distinct from old.locked_until
     or new.last_login is distinct from old.last_login then
    raise exception 'Sign-in fields are maintained by the system' using errcode = '42501';
  end if;

  v_is_admin := public.has_permission('users.manage');
  if not v_is_admin or old.id = v_uid then
    if new.role_id <> old.role_id
       or new.status <> old.status
       or new.username is distinct from old.username
       or new.employee_code is distinct from old.employee_code
       or new.all_registers <> old.all_registers then
      raise exception 'You can only change your name, phone number and photo' using errcode = '42501';
    end if;
  end if;

  -- Unlocking an account clears the failed sign-in counter.
  if old.status = 'Locked' and new.status = 'Active' then
    new.failed_login_count := 0;
    new.locked_until := null;
  end if;

  return new;
end;
$$;

create function public.prepare_activity_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.ip_address := coalesce(new.ip_address, public.request_ip());
  new.user_agent := coalesce(nullif(new.user_agent, ''), left(public.request_header('user-agent'), 500));
  new.created_at := now();
  return new;
end;
$$;

create function public.prepare_return()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders as o
  where o.id = new.order_id and o.store_id = new.store_id;
  if not found then
    raise exception 'Order not found in this store';
  end if;
  if v_order.status <> 'Completed' then
    raise exception 'Only completed orders can be returned';
  end if;

  new.customer_id := v_order.customer_id;
  new.status := 'Pending';
  new.requested_by := coalesce((select auth.uid()), new.requested_by);
  new.approved_by := null;
  new.approved_at := null;
  new.processed_by := null;
  new.completed_at := null;
  new.rejected_by := null;
  new.rejected_at := null;
  new.rejection_reason := null;
  new.subtotal := 0;
  new.tax_amount := 0;
  new.refund_amount := 0;
  new.created_at := now();
  return new;
end;
$$;

create function public.prepare_return_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.returns%rowtype;
  v_item public.order_items%rowtype;
  v_already integer;
begin
  select * into v_return from public.returns as r
  where r.id = new.return_id and r.store_id = new.store_id;
  if not found then
    raise exception 'Return not found in this store';
  end if;
  if v_return.status <> 'Pending' then
    raise exception 'Items can only be added while the return is Pending';
  end if;

  select * into v_item from public.order_items as oi
  where oi.id = new.order_item_id and oi.order_id = v_return.order_id
  for update;
  if not found then
    raise exception 'That item is not part of the returned order';
  end if;

  select coalesce(sum(ri.quantity), 0) into v_already
  from public.return_items as ri
  join public.returns as r on r.id = ri.return_id
  where ri.order_item_id = new.order_item_id and r.status <> 'Rejected';

  if v_already + new.quantity > v_item.quantity then
    raise exception 'Only % of % can still be returned', v_item.quantity - v_already, v_item.product_name;
  end if;

  new.product_id := v_item.product_id;
  new.product_name := v_item.product_name;
  new.sku := v_item.sku;
  new.unit_price := v_item.unit_price;
  new.tax_rate := v_item.tax_rate;
  new.refund_amount := round((v_item.line_total - v_item.tax_amount) / v_item.quantity * new.quantity, 2);
  new.tax_amount := round(v_item.tax_amount / v_item.quantity * new.quantity, 2);
  new.restock := coalesce(new.restock, v_return.reason not in ('Damaged', 'Defective'));
  new.created_at := now();
  return new;
end;
$$;

create function public.refresh_return_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return_id uuid;
begin
  if tg_op = 'DELETE' then
    v_return_id := old.return_id;
  else
    v_return_id := new.return_id;
  end if;

  update public.returns as r
  set subtotal = t.subtotal,
      tax_amount = t.tax,
      refund_amount = t.subtotal + t.tax
  from (
    select coalesce(sum(ri.refund_amount), 0) as subtotal, coalesce(sum(ri.tax_amount), 0) as tax
    from public.return_items as ri where ri.return_id = v_return_id
  ) as t
  where r.id = v_return_id;
  return null;
end;
$$;

-- Enforces the return workflow, stamps who approved/rejected/completed it, and on completion
-- restocks the flagged items and marks the order Refunded once everything has come back.
create function public.guard_return_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if pg_trigger_depth() > 1 then
    new.updated_at := now();
    return new;
  end if;

  new.id := old.id;
  new.store_id := old.store_id;
  new.order_id := old.order_id;
  new.customer_id := old.customer_id;
  new.return_number := old.return_number;
  new.requested_by := old.requested_by;
  new.subtotal := old.subtotal;
  new.tax_amount := old.tax_amount;
  new.refund_amount := old.refund_amount;
  new.created_at := old.created_at;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.processed_by := old.processed_by;
  new.completed_at := old.completed_at;
  new.rejected_by := old.rejected_by;
  new.rejected_at := old.rejected_at;

  if new.status is distinct from old.status then
    if not public.has_permission('returns.process') then
      raise exception 'You do not have permission to process returns' using errcode = '42501';
    end if;

    if old.status = 'Pending' and new.status = 'Approved' then
      if not exists (select 1 from public.return_items as ri where ri.return_id = old.id) then
        raise exception 'Add at least one item before approving the return';
      end if;
      new.approved_by := v_uid;
      new.approved_at := now();
    elsif old.status in ('Pending', 'Approved') and new.status = 'Rejected' then
      if coalesce(trim(new.rejection_reason), '') = '' then
        raise exception 'A rejection reason is required';
      end if;
      new.rejected_by := v_uid;
      new.rejected_at := now();
    elsif old.status = 'Approved' and new.status = 'Completed' then
      new.processed_by := v_uid;
      new.completed_at := now();

      insert into public.stock_movements (
        store_id, product_id, adjustment_type, quantity, reference_type, reference_id, notes
      )
      select ri.store_id, ri.product_id, 'Return', ri.quantity, 'return', old.id, 'Return ' || old.return_number
      from public.return_items as ri
      where ri.return_id = old.id and ri.restock;

      update public.orders as o
      set status = 'Refunded'
      where o.id = old.order_id
        and not exists (
          select 1 from public.order_items as oi
          where oi.order_id = o.id
            and oi.quantity > (
              select coalesce(sum(ri.quantity), 0)
              from public.return_items as ri
              join public.returns as r on r.id = ri.return_id
              where ri.order_item_id = oi.id and (r.status = 'Completed' or r.id = old.id)
            )
        );
    else
      raise exception 'A return cannot move from % to %', old.status, new.status;
    end if;
  elsif old.status <> 'Pending' then
    raise exception 'Only pending returns can be edited';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Sign-up: a new business, its first store and Admin. Staff accounts created by an admin
-- through the service role carry store_id/role in app_metadata, which users cannot set.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_app jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_username text := nullif(trim(v_meta ->> 'username'), '');
  v_full_name text := coalesce(nullif(trim(v_meta ->> 'full_name'), ''), new.email);
  v_business_type text := coalesce(nullif(trim(v_meta ->> 'business_type'), ''), 'Retail');
  v_currency text := upper(coalesce(nullif(trim(v_meta ->> 'currency'), ''), 'USD'));
  v_business_id uuid;
  v_store_id uuid;
  v_register_id uuid;
  v_role_name text;
  v_role_id smallint;
  v_access text;
begin
  if v_username is not null and v_username !~ '^[A-Za-z0-9_]{4,20}$' then
    raise exception 'Username must be 4-20 letters, numbers or underscores';
  end if;

  if nullif(v_app ->> 'store_id', '') is not null then
    v_store_id := (v_app ->> 'store_id')::uuid;
    select s.business_id into v_business_id
    from public.stores as s where s.id = v_store_id and s.status = 'Active';
    if v_business_id is null then
      raise exception 'The store for this staff account is not available';
    end if;

    v_role_name := coalesce(nullif(v_app ->> 'role', ''), 'Cashier');
    if v_role_name = 'Administrator' then
      v_role_name := 'Admin';
    end if;
    select r.id into v_role_id from public.roles as r where r.name = v_role_name;
    if v_role_id is null then
      raise exception 'Unknown role %', v_role_name;
    end if;
    v_access := coalesce(nullif(v_app ->> 'register_access', ''), 'None');

    insert into public.users (
      id, business_id, store_id, role_id, full_name, email, username, employee_code, phone, all_registers
    )
    values (
      new.id, v_business_id, v_store_id, v_role_id, v_full_name, new.email, v_username,
      nullif(trim(v_app ->> 'employee_code'), ''), coalesce(v_meta ->> 'phone', ''),
      v_access = 'All Registers'
    );

    insert into public.user_register_access (user_id, register_id)
    select new.id, r.id from public.registers as r
    where r.store_id = v_store_id and r.name = v_access;
  else
    if v_business_type not in ('Retail', 'Electronics', 'Grocery', 'Pharmacy', 'Restaurant', 'Other') then
      v_business_type := 'Other';
    end if;
    if v_currency !~ '^[A-Z]{3}$' then
      v_currency := 'USD';
    end if;

    insert into public.businesses (name, business_type, phone, country, currency, owner_user_id)
    values (
      coalesce(nullif(trim(v_meta ->> 'business_name'), ''), split_part(new.email, '@', 1) || '''s Business'),
      v_business_type,
      coalesce(v_meta ->> 'business_phone', ''),
      coalesce(nullif(trim(v_meta ->> 'country'), ''), 'Sri Lanka'),
      v_currency,
      new.id
    )
    returning id into v_business_id;

    insert into public.stores (business_id, name, code, phone, country)
    select b.id, b.name, 'STORE-001', b.phone, b.country
    from public.businesses as b where b.id = v_business_id
    returning id into v_store_id;

    insert into public.registers (store_id, name)
    values (v_store_id, 'Register #01')
    returning id into v_register_id;

    insert into public.store_settings (store_id, currency, default_register_id)
    values (v_store_id, v_currency, v_register_id);

    select r.id into v_role_id from public.roles as r where r.name = 'Admin';
    insert into public.users (id, business_id, store_id, role_id, full_name, email, username, all_registers)
    values (new.id, v_business_id, v_store_id, v_role_id, v_full_name, new.email, v_username, true);

    insert into public.customers (store_id, code, name, customer_type, is_walk_in)
    values (v_store_id, 'CUS-001', 'Walk-in Customer', 'Individual', true);
  end if;

  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = new.email
  where id = new.id and email is distinct from new.email;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Triggers
-- ---------------------------------------------------------------------------

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_auth_user_email();

do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses', 'stores', 'users', 'user_preferences', 'registers', 'store_settings',
    'categories', 'suppliers', 'customers', 'products', 'inventory', 'shifts', 'orders', 'invoices'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

create trigger guard_user_update
  before update on public.users
  for each row execute function public.guard_user_update();

create trigger products_create_inventory
  after insert on public.products
  for each row execute function public.create_inventory_row();

create trigger apply_stock_movement
  before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

create trigger assign_order_number
  before insert on public.orders
  for each row execute function public.assign_document_number();

create trigger assign_invoice_number
  before insert on public.invoices
  for each row execute function public.assign_document_number();

create trigger assign_return_number
  before insert on public.returns
  for each row execute function public.assign_document_number();

create trigger prepare_return
  before insert on public.returns
  for each row execute function public.prepare_return();

create trigger guard_return_update
  before update on public.returns
  for each row execute function public.guard_return_update();

create trigger prepare_return_item
  before insert on public.return_items
  for each row execute function public.prepare_return_item();

create trigger refresh_return_totals
  after insert or delete on public.return_items
  for each row execute function public.refresh_return_totals();

create trigger prepare_activity_log
  before insert on public.activity_logs
  for each row execute function public.prepare_activity_log();

-- ---------------------------------------------------------------------------
-- 13. RPCs
-- ---------------------------------------------------------------------------

-- Prices a POS sale from the catalogue (client prices are ignored), applies line and order
-- discounts, records payments and Sale stock movements, and issues the invoice — in one
-- transaction. p_hold = true saves the cart as a Held order instead; pass p_held_order_id to
-- complete or re-save a held sale.
--   p_items:    [{ "product_id": uuid, "quantity": int, "discount_amount": numeric? }]
--   p_payments: [{ "method": "Cash"|"Card"|"Bank Transfer"|"Other", "amount": numeric,
--                  "tendered_amount": numeric?, "reference": text? }]
create function public.complete_sale(
  p_register_id uuid,
  p_items jsonb,
  p_payments jsonb default '[]'::jsonb,
  p_customer_id uuid default null,
  p_discount_type text default null,
  p_discount_value numeric default 0,
  p_hold boolean default false,
  p_held_order_id uuid default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_settings public.store_settings%rowtype;
  v_customer public.customers%rowtype;
  v_product public.products%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_invoice_number text;
  v_item jsonb;
  v_line jsonb;
  v_payment jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_qty integer;
  v_gross numeric(12, 2);
  v_line_discount numeric(12, 2);
  v_net numeric(12, 2);
  v_share numeric(12, 2);
  v_tax numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_line_discounts numeric(12, 2) := 0;
  v_net_total numeric(12, 2);
  v_order_discount numeric(12, 2) := 0;
  v_allocated numeric(12, 2) := 0;
  v_tax_total numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_method text;
  v_amount numeric(12, 2);
  v_tendered numeric(12, 2);
  v_paid numeric(12, 2) := 0;
  v_change numeric(12, 2) := 0;
  v_index integer := 0;
  v_count integer;
  v_shift_id uuid;
begin
  select * into v_user from public.users as u where u.id = (select auth.uid()) and u.status = 'Active';
  if not found or not public.has_permission('pos.use') then
    raise exception 'You do not have permission to use the POS' using errcode = '42501';
  end if;
  select * into v_settings from public.store_settings as s where s.store_id = v_user.store_id;

  if not exists (
    select 1 from public.registers as r
    where r.id = p_register_id and r.store_id = v_user.store_id and r.status = 'Active'
  ) then
    raise exception 'Register is not available';
  end if;
  if not v_user.all_registers and not exists (
    select 1 from public.user_register_access as a
    where a.user_id = v_user.id and a.register_id = p_register_id
  ) then
    raise exception 'You do not have access to this register' using errcode = '42501';
  end if;

  if p_customer_id is null then
    select * into v_customer from public.customers as c
    where c.store_id = v_user.store_id and c.is_walk_in;
  else
    select * into v_customer from public.customers as c
    where c.id = p_customer_id and c.store_id = v_user.store_id and c.status = 'Active';
    if not found then
      raise exception 'Customer is not available';
    end if;
  end if;
  if v_settings.require_customer_for_sale and not p_hold
     and (v_customer.id is null or v_customer.is_walk_in) then
    raise exception 'Select a customer for this sale';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the sale';
  end if;
  if p_discount_type is not null and p_discount_type not in ('percent', 'fixed') then
    raise exception 'Discount type must be percent or fixed';
  end if;
  if coalesce(p_discount_value, 0) < 0 or (p_discount_type = 'percent' and p_discount_value > 100) then
    raise exception 'Discount value is out of range';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Item quantities must be greater than zero';
    end if;
    select * into v_product from public.products as p
    where p.id = (v_item ->> 'product_id')::uuid and p.store_id = v_user.store_id and p.status = 'Active';
    if not found then
      raise exception 'A product in the cart is not available';
    end if;

    v_gross := round(v_product.selling_price * v_qty, 2);
    v_line_discount := round(coalesce((v_item ->> 'discount_amount')::numeric, 0), 2);
    if v_line_discount <> 0 and not v_settings.allow_line_discounts then
      raise exception 'Line discounts are turned off for this store';
    end if;
    if v_line_discount < 0 or v_line_discount > v_gross then
      raise exception 'Line discount for % is out of range', v_product.name;
    end if;

    v_subtotal := v_subtotal + v_gross;
    v_line_discounts := v_line_discounts + v_line_discount;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.name,
      'sku', v_product.sku,
      'quantity', v_qty,
      'unit_price', v_product.selling_price,
      'unit_cost', v_product.purchase_price,
      'tax_rate', v_product.tax_rate,
      'gross', v_gross,
      'line_discount', v_line_discount
    ));
  end loop;

  v_net_total := v_subtotal - v_line_discounts;
  v_order_discount := case p_discount_type
    when 'percent' then round(v_net_total * coalesce(p_discount_value, 0) / 100, 2)
    when 'fixed' then round(coalesce(p_discount_value, 0), 2)
    else 0
  end;
  if v_order_discount > v_net_total then
    raise exception 'The discount is larger than the sale';
  end if;
  if v_subtotal > 0 and (v_line_discounts + v_order_discount) / v_subtotal * 100 > v_settings.maximum_discount then
    raise exception 'The discount is above the store maximum of % percent', v_settings.maximum_discount;
  end if;

  if p_held_order_id is not null then
    select o.id, o.order_number into v_order_id, v_order_number
    from public.orders as o
    where o.id = p_held_order_id and o.store_id = v_user.store_id and o.status = 'Held'
    for update;
    if not found then
      raise exception 'Held sale not found';
    end if;
    delete from public.order_items where order_id = v_order_id;
  else
    insert into public.orders (store_id, register_id, customer_id, cashier_user_id, status)
    values (v_user.store_id, p_register_id, v_customer.id, v_user.id, 'Held')
    returning id, order_number into v_order_id, v_order_number;
  end if;

  v_count := jsonb_array_length(v_lines);
  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    v_index := v_index + 1;
    v_net := (v_line ->> 'gross')::numeric - (v_line ->> 'line_discount')::numeric;
    if v_index = v_count then
      v_share := v_order_discount - v_allocated;
    elsif v_net_total = 0 then
      v_share := 0;
    else
      v_share := round(v_order_discount * v_net / v_net_total, 2);
    end if;
    v_allocated := v_allocated + v_share;
    v_net := v_net - v_share;

    if v_settings.prices_include_tax then
      v_tax := round(v_net - v_net / (1 + (v_line ->> 'tax_rate')::numeric / 100), 2);
    else
      v_tax := round(v_net * (v_line ->> 'tax_rate')::numeric / 100, 2);
    end if;
    v_tax_total := v_tax_total + v_tax;

    insert into public.order_items (
      store_id, order_id, product_id, product_name, sku, quantity, unit_price, unit_cost,
      discount_amount, tax_rate, tax_amount, line_total
    )
    values (
      v_user.store_id, v_order_id, (v_line ->> 'product_id')::uuid, v_line ->> 'name', v_line ->> 'sku',
      (v_line ->> 'quantity')::integer, (v_line ->> 'unit_price')::numeric, (v_line ->> 'unit_cost')::numeric,
      (v_line ->> 'line_discount')::numeric + v_share, (v_line ->> 'tax_rate')::numeric, v_tax,
      case when v_settings.prices_include_tax then v_net else v_net + v_tax end
    );
  end loop;

  v_total := v_net_total - v_order_discount
    + case when v_settings.prices_include_tax then 0 else v_tax_total end;

  update public.orders
  set register_id = p_register_id,
      customer_id = v_customer.id,
      cashier_user_id = v_user.id,
      discount_type = p_discount_type,
      discount_value = coalesce(p_discount_value, 0),
      subtotal = v_subtotal,
      discount_amount = v_line_discounts + v_order_discount,
      tax_amount = v_tax_total,
      total_amount = v_total,
      notes = coalesce(p_notes, '')
  where id = v_order_id;

  if p_hold then
    return jsonb_build_object(
      'order_id', v_order_id, 'order_number', v_order_number, 'status', 'Held',
      'subtotal', v_subtotal, 'discount_amount', v_line_discounts + v_order_discount,
      'tax_amount', v_tax_total, 'total_amount', v_total
    );
  end if;

  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Add a payment to complete the sale';
  end if;
  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    v_method := v_payment ->> 'method';
    v_amount := round((v_payment ->> 'amount')::numeric, 2);
    v_tendered := round(coalesce((v_payment ->> 'tendered_amount')::numeric, v_amount), 2);
    if v_method is null or v_method not in ('Cash', 'Card', 'Bank Transfer', 'Other') then
      raise exception 'Unsupported payment method %', v_method;
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Payment amounts must be greater than zero';
    end if;
    if v_tendered < v_amount then
      raise exception 'Amount tendered is less than the payment';
    end if;
    if v_method <> 'Cash' and v_tendered <> v_amount then
      raise exception 'Only cash payments can give change';
    end if;

    insert into public.payments (
      store_id, order_id, payment_method, amount, tendered_amount, change_amount, reference, processed_by
    )
    values (
      v_user.store_id, v_order_id, v_method, v_amount, v_tendered, v_tendered - v_amount,
      coalesce(v_payment ->> 'reference', ''), v_user.id
    );
    v_paid := v_paid + v_amount;
    v_change := v_change + (v_tendered - v_amount);
  end loop;
  if v_paid <> v_total then
    raise exception 'Payments (%) do not match the sale total (%)', v_paid, v_total;
  end if;

  insert into public.stock_movements (store_id, product_id, adjustment_type, quantity, reference_type, reference_id, notes)
  select v_user.store_id, oi.product_id, 'Sale', oi.quantity, 'order', v_order_id, 'Sale ' || v_order_number
  from public.order_items as oi
  where oi.order_id = v_order_id;

  select s.id into v_shift_id from public.shifts as s
  where s.register_id = p_register_id and s.status = 'Open';

  update public.orders
  set status = 'Completed', completed_at = now(), shift_id = v_shift_id
  where id = v_order_id;

  if v_settings.auto_generate_invoice then
    insert into public.invoices (
      store_id, order_id, customer_id, invoice_date, due_date,
      customer_name, customer_code, customer_type, customer_phone, customer_email, customer_address,
      subtotal, discount_amount, tax_amount, total_amount, status
    )
    values (
      v_user.store_id, v_order_id, v_customer.id, now(), now(),
      coalesce(v_customer.name, 'Walk-in Customer'), coalesce(v_customer.code, ''), v_customer.customer_type,
      coalesce(v_customer.phone, ''), coalesce(v_customer.email, ''),
      concat_ws(', ', nullif(v_customer.address, ''), nullif(v_customer.city, ''), nullif(v_customer.country, '')),
      v_subtotal, v_line_discounts + v_order_discount, v_tax_total, v_total, 'Paid'
    )
    returning invoice_number into v_invoice_number;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'invoice_number', v_invoice_number,
    'status', 'Completed',
    'subtotal', v_subtotal,
    'discount_amount', v_line_discounts + v_order_discount,
    'tax_amount', v_tax_total,
    'total_amount', v_total,
    'change_amount', v_change
  );
end;
$$;

-- Call after a successful Supabase sign-in: refuses Inactive/Locked accounts, updates
-- last_login and writes the "Signed in" activity entry.
create function public.record_sign_in()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
begin
  select * into v_user from public.users as u where u.id = (select auth.uid());
  if not found then
    raise exception 'No staff profile exists for this account' using errcode = '42501';
  end if;
  if v_user.status <> 'Active' then
    raise exception 'This account is %', lower(v_user.status) using errcode = '42501';
  end if;

  perform set_config('pos.trusted_update', 'on', true);
  update public.users set last_login = now(), failed_login_count = 0, locked_until = null
  where id = v_user.id;
  perform set_config('pos.trusted_update', 'off', true);

  insert into public.activity_logs (store_id, user_id, entity_type, entity_id, action)
  values (v_user.store_id, v_user.id, 'user', v_user.id, 'Signed in');

  return jsonb_build_object('user_id', v_user.id, 'permissions', public.current_user_permissions());
end;
$$;

-- Lets the sign-up form check a username before submitting. Returns only true/false.
create function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.users as u where lower(u.username) = lower(trim(p_username)))
$$;

-- Username -> email for sign-in, since Supabase Auth signs in by email. Service role only,
-- so it cannot be used from the browser to look up staff emails.
create function public.get_login_email(p_identifier text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when position('@' in p_identifier) > 0 then lower(trim(p_identifier))
    else (select u.email from public.users as u where lower(u.username) = lower(trim(p_identifier)))
  end
$$;

-- ---------------------------------------------------------------------------
-- 14. Views (security_invoker, so table RLS applies)
-- ---------------------------------------------------------------------------

create view public.inventory_overview with (security_invoker = true) as
select
  i.id,
  i.store_id,
  i.product_id,
  p.name as product_name,
  p.sku,
  p.barcode,
  p.category_id,
  c.name as category_name,
  p.supplier_id,
  s.name as supplier_name,
  i.current_stock,
  i.reserved_stock,
  p.reorder_level,
  p.purchase_price,
  p.selling_price,
  p.tax_rate,
  p.status as product_status,
  case
    when i.current_stock <= 0 then 'Out of Stock'
    when i.current_stock <= p.reorder_level then 'Low Stock'
    else 'In Stock'
  end as stock_status,
  i.updated_at
from public.inventory as i
join public.products as p on p.id = i.product_id
left join public.categories as c on c.id = p.category_id
left join public.suppliers as s on s.id = p.supplier_id;

create view public.categories_with_counts with (security_invoker = true) as
select c.*, (select count(*) from public.products as p where p.category_id = c.id)::integer as product_count
from public.categories as c;

create view public.suppliers_with_counts with (security_invoker = true) as
select s.*, (select count(*) from public.products as p where p.supplier_id = s.id)::integer as product_count
from public.suppliers as s;

create view public.customers_with_order_counts with (security_invoker = true) as
select c.*, (
  select count(*) from public.orders as o
  where o.customer_id = c.id and o.status in ('Completed', 'Refunded')
)::integer as order_count
from public.customers as c;

-- payment_method is 'Mixed' when a sale has more than one payment row.
create view public.order_summaries with (security_invoker = true) as
select
  o.*,
  (select coalesce(sum(oi.quantity), 0) from public.order_items as oi where oi.order_id = o.id)::integer as item_count,
  pm.payment_method,
  pm.paid_amount,
  case
    when o.status = 'Refunded' then 'Refunded'
    when pm.payment_count > 0 and pm.paid_amount >= o.total_amount then 'Paid'
    else 'Pending'
  end as payment_status,
  c.name as customer_name,
  c.code as customer_code,
  u.full_name as cashier_name,
  inv.invoice_number
from public.orders as o
left join lateral (
  select
    case when count(*) > 1 then 'Mixed' else min(p.payment_method) end as payment_method,
    coalesce(sum(p.amount) filter (where p.payment_status = 'Completed'), 0) as paid_amount,
    count(*) as payment_count
  from public.payments as p
  where p.order_id = o.id
) as pm on true
left join public.customers as c on c.id = o.customer_id
left join public.users as u on u.id = o.cashier_user_id
left join public.invoices as inv on inv.order_id = o.id;

-- ---------------------------------------------------------------------------
-- 15. Row-level security
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses', 'stores', 'roles', 'permissions', 'role_permissions', 'users', 'user_preferences',
    'registers', 'user_register_access', 'store_settings', 'categories', 'suppliers', 'customers',
    'products', 'inventory', 'stock_movements', 'shifts', 'orders', 'order_items', 'payments',
    'invoices', 'returns', 'return_items', 'activity_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

create policy "signed-in users read roles" on public.roles
  for select to authenticated using (true);
create policy "signed-in users read permissions" on public.permissions
  for select to authenticated using (true);
create policy "signed-in users read role permissions" on public.role_permissions
  for select to authenticated using (true);

create policy "members read their business" on public.businesses
  for select to authenticated
  using (id = (select public.current_user_business_id()));
create policy "admins update their business" on public.businesses
  for update to authenticated
  using (id = (select public.current_user_business_id()) and (select public.has_permission('settings.manage')))
  with check (id = (select public.current_user_business_id()));

create policy "members read stores in their business" on public.stores
  for select to authenticated
  using (business_id = (select public.current_user_business_id()));
create policy "admins update their store" on public.stores
  for update to authenticated
  using (id = (select public.current_user_store_id()) and (select public.has_permission('settings.manage')))
  with check (id = (select public.current_user_store_id()) and business_id = (select public.current_user_business_id()));

create policy "members read store settings" on public.store_settings
  for select to authenticated
  using (store_id = (select public.current_user_store_id()));
create policy "admins update store settings" on public.store_settings
  for update to authenticated
  using (store_id = (select public.current_user_store_id()) and (select public.has_permission('settings.manage')))
  with check (store_id = (select public.current_user_store_id()));

-- Inactive and Locked users can still read their own row (to show why sign-in was refused).
create policy "members read staff in their store" on public.users
  for select to authenticated
  using (id = (select auth.uid()) or store_id = (select public.current_user_store_id()));
create policy "users update own profile and admins update staff" on public.users
  for update to authenticated
  using (
    (id = (select auth.uid()) and status = 'Active')
    or (store_id = (select public.current_user_store_id()) and (select public.has_permission('users.manage')))
  )
  with check (id = (select auth.uid()) or store_id = (select public.current_user_store_id()));

create policy "users manage own preferences" on public.user_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "members read register access" on public.user_register_access
  for select to authenticated
  using (exists (
    select 1 from public.users as u
    where u.id = user_register_access.user_id and u.store_id = (select public.current_user_store_id())
  ));
create policy "admins grant register access" on public.user_register_access
  for insert to authenticated
  with check (
    (select public.has_permission('users.manage'))
    and exists (select 1 from public.users as u
                where u.id = user_register_access.user_id and u.store_id = (select public.current_user_store_id()))
    and exists (select 1 from public.registers as r
                where r.id = user_register_access.register_id and r.store_id = (select public.current_user_store_id()))
  );
create policy "admins revoke register access" on public.user_register_access
  for delete to authenticated
  using (
    (select public.has_permission('users.manage'))
    and exists (select 1 from public.users as u
                where u.id = user_register_access.user_id and u.store_id = (select public.current_user_store_id()))
  );

-- Master data: read with any of the listed permissions, write with the manage permission.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('categories', array['categories.view', 'products.view', 'pos.use'], 'categories.manage'),
      ('suppliers', array['suppliers.view', 'products.view', 'inventory.view'], 'suppliers.manage'),
      ('customers', array['customers.view', 'pos.use'], 'customers.manage'),
      ('products', array['products.view', 'inventory.view', 'pos.use'], 'products.manage'),
      ('registers', array['dashboard.view', 'pos.use', 'users.manage', 'settings.manage'], 'settings.manage')
    ) as v (table_name, read_keys, manage_key)
  loop
    execute format(
      'create policy "staff read %1$s" on public.%1$I for select to authenticated
         using (store_id = (select public.current_user_store_id()) and (select public.has_any_permission(%2$L::text[])))',
      spec.table_name, spec.read_keys
    );
    execute format(
      'create policy "managers insert %1$s" on public.%1$I for insert to authenticated
         with check (store_id = (select public.current_user_store_id()) and (select public.has_permission(%2$L)))',
      spec.table_name, spec.manage_key
    );
    execute format(
      'create policy "managers update %1$s" on public.%1$I for update to authenticated
         using (store_id = (select public.current_user_store_id()) and (select public.has_permission(%2$L)))
         with check (store_id = (select public.current_user_store_id()))',
      spec.table_name, spec.manage_key
    );
    execute format(
      'create policy "managers delete %1$s" on public.%1$I for delete to authenticated
         using (store_id = (select public.current_user_store_id()) and (select public.has_permission(%2$L)))',
      spec.table_name, spec.manage_key
    );
  end loop;
end;
$$;

-- Inventory is read-only to clients; it changes through stock_movements.
create policy "staff read inventory" on public.inventory
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['inventory.view', 'products.view', 'pos.use']))
  );

create policy "staff read stock movements" on public.stock_movements
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['inventory.view', 'reports.view']))
  );
create policy "inventory managers adjust stock" on public.stock_movements
  for insert to authenticated
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_permission('inventory.manage'))
    and adjustment_type in ('Add Stock', 'Remove Stock', 'Set Stock Level', 'Received')
  );

create policy "staff read shifts" on public.shifts
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['pos.use', 'reports.view']))
  );
create policy "cashiers open shifts" on public.shifts
  for insert to authenticated
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_permission('pos.use'))
    and opened_by = (select auth.uid())
    and status = 'Open'
  );
create policy "cashiers close shifts" on public.shifts
  for update to authenticated
  using (store_id = (select public.current_user_store_id()) and (select public.has_permission('pos.use')))
  with check (
    store_id = (select public.current_user_store_id())
    and (status = 'Open' or closed_by = (select auth.uid()))
  );

-- Sales are written by complete_sale(); clients only read them.
create policy "staff read orders" on public.orders
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['orders.view', 'invoices.view', 'returns.view', 'reports.view']))
  );
create policy "staff read order items" on public.order_items
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['orders.view', 'invoices.view', 'returns.view', 'reports.view']))
  );
create policy "staff read payments" on public.payments
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['orders.view', 'invoices.view', 'reports.view']))
  );
create policy "staff read invoices" on public.invoices
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['invoices.view', 'orders.view', 'reports.view']))
  );

create policy "staff read returns" on public.returns
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['returns.view', 'returns.process', 'reports.view']))
  );
create policy "staff request returns" on public.returns
  for insert to authenticated
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['returns.view', 'returns.process']))
  );
create policy "return processors update returns" on public.returns
  for update to authenticated
  using (store_id = (select public.current_user_store_id()) and (select public.has_permission('returns.process')))
  with check (store_id = (select public.current_user_store_id()));

create policy "staff read return items" on public.return_items
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['returns.view', 'returns.process', 'reports.view']))
  );
create policy "staff add return items" on public.return_items
  for insert to authenticated
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['returns.view', 'returns.process']))
  );
create policy "staff remove items from pending returns" on public.return_items
  for delete to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['returns.view', 'returns.process']))
    and exists (select 1 from public.returns as r where r.id = return_items.return_id and r.status = 'Pending')
  );

create policy "users read own activity and admins read store activity" on public.activity_logs
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (user_id = (select auth.uid()) or (select public.has_permission('users.manage')))
  );
create policy "users record own activity" on public.activity_logs
  for insert to authenticated
  with check (
    store_id = (select public.current_user_store_id())
    and user_id = (select auth.uid())
    and action in ('Signed out', 'Password changed', 'Profile updated')
  );

-- ---------------------------------------------------------------------------
-- 16. Grants
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.current_user_store_id() to authenticated;
grant execute on function public.current_user_business_id() to authenticated;
grant execute on function public.has_any_permission(text[]) to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.current_user_permissions() to authenticated;
grant execute on function public.record_sign_in() to authenticated;
grant execute on function public.complete_sale(uuid, jsonb, jsonb, uuid, text, numeric, boolean, uuid, text)
  to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.get_login_email(text) to service_role;

-- Clients never write these directly.
revoke insert, update, delete on public.inventory, public.orders, public.order_items, public.payments,
  public.invoices, public.businesses, public.roles, public.permissions, public.role_permissions
  from authenticated;
grant update on public.businesses to authenticated;
revoke insert, delete on public.users, public.stores, public.store_settings from authenticated;
revoke update, delete on public.stock_movements, public.activity_logs from authenticated;

-- ---------------------------------------------------------------------------
-- 17. Copy master data from the draft schema
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('legacy_v1.stores') is null then
    return;
  end if;

  insert into public.businesses (id, name, business_type, phone, country, currency, owner_user_id, created_at, updated_at)
  select
    s.id,
    s.name,
    case when s.business_type in ('Retail', 'Electronics', 'Grocery', 'Pharmacy', 'Restaurant', 'Other')
         then s.business_type else 'Other' end,
    coalesce(s.phone, ''),
    coalesce(s.country, 'Sri Lanka'),
    case when upper(s.currency) ~ '^[A-Z]{3}$' then upper(s.currency) else 'USD' end,
    (select up.id from legacy_v1.user_profiles as up
     where up.store_id = s.id and up.role in ('Admin', 'Administrator')
     order by up.created_at limit 1),
    s.created_at,
    s.updated_at
  from legacy_v1.stores as s;

  insert into public.stores (id, business_id, name, code, phone, country, timezone, status, created_at, updated_at)
  select s.id, s.id, s.name, s.code, coalesce(s.phone, ''), coalesce(s.country, 'Sri Lanka'),
         coalesce(s.timezone, 'Asia/Colombo'), s.status, s.created_at, s.updated_at
  from legacy_v1.stores as s;

  insert into public.registers (id, store_id, name, status, created_at)
  select r.id, r.store_id, r.name, r.status, r.created_at
  from legacy_v1.registers as r;

  insert into public.store_settings (store_id, currency, default_register_id)
  select s.id, b.currency,
         (select r.id from public.registers as r where r.store_id = s.id order by r.created_at, r.name limit 1)
  from public.stores as s
  join public.businesses as b on b.id = s.business_id;

  -- Inventory Clerk and Accountant have no permission set yet; they become Cashier (least access).
  insert into public.users (
    id, business_id, store_id, role_id, full_name, email, username, employee_code, phone, status,
    all_registers, last_login, created_at, updated_at
  )
  select
    up.id, up.store_id, up.store_id,
    (select r.id from public.roles as r where r.name = case
       when up.role in ('Admin', 'Administrator') then 'Admin'
       when up.role = 'Manager' then 'Manager'
       else 'Cashier' end),
    up.full_name, up.email,
    case when up.username ~ '^[A-Za-z0-9_]{4,20}$' then up.username end,
    up.employee_code, coalesce(up.phone, ''), up.status,
    up.role in ('Admin', 'Administrator') or up.register_access = 'All Registers',
    up.last_login, up.created_at, up.updated_at
  from legacy_v1.user_profiles as up
  where exists (select 1 from auth.users as a where a.id = up.id)
  on conflict do nothing;

  insert into public.user_register_access (user_id, register_id)
  select u.id, r.id
  from legacy_v1.user_profiles as up
  join public.users as u on u.id = up.id
  join public.registers as r on r.store_id = up.store_id and r.name = up.register_access
  on conflict do nothing;

  insert into public.user_preferences (user_id)
  select u.id from public.users as u
  on conflict do nothing;

  insert into public.categories (id, store_id, name, description, status, created_at, updated_at)
  select c.id, c.store_id, c.name, c.description, c.status, c.created_at, c.updated_at
  from legacy_v1.categories as c
  on conflict do nothing;

  insert into public.suppliers (
    id, store_id, code, name, contact_person, phone, email, address, city, country, supplier_type,
    status, created_at, updated_at
  )
  select s.id, s.store_id, s.code, s.name, s.contact_person, s.phone, s.email, s.address, s.city, s.country,
         case when s.supplier_type in ('Manufacturer', 'Distributor', 'Wholesaler', 'Local Supplier')
              then s.supplier_type else 'Local Supplier' end,
         s.status, s.created_at, s.updated_at
  from legacy_v1.suppliers as s
  on conflict do nothing;

  insert into public.customers (
    id, store_id, code, name, customer_type, phone, email, address, city, country, is_walk_in,
    status, created_at, updated_at
  )
  select c.id, c.store_id, c.code, c.name, c.customer_type, c.phone, c.email, c.address, c.city, c.country,
         c.is_walk_in, c.status, c.created_at, c.updated_at
  from legacy_v1.customers as c
  on conflict do nothing;

  insert into public.customers (store_id, code, name, customer_type, is_walk_in)
  select s.id, 'CUS-001', 'Walk-in Customer', 'Individual', true
  from public.stores as s
  where not exists (select 1 from public.customers as c where c.store_id = s.id and c.is_walk_in)
  on conflict do nothing;

  insert into public.products (
    id, store_id, category_id, supplier_id, sku, barcode, name, description, purchase_price,
    selling_price, tax_rate, reorder_level, status, created_at, updated_at
  )
  select p.id, p.store_id,
         (select c.id from public.categories as c where c.id = p.category_id),
         (select s.id from public.suppliers as s where s.id = p.supplier_id),
         p.sku, p.barcode, p.name, p.description, p.purchase_price, p.selling_price,
         round(p.tax_rate, 2), greatest(round(p.reorder_level), 0)::integer, p.status,
         p.created_at, p.updated_at
  from legacy_v1.products as p
  on conflict do nothing;

  insert into public.stock_movements (store_id, product_id, adjustment_type, reason, quantity, reference_type, notes)
  select i.store_id, i.product_id, 'Set Stock Level', 'Stock Count', greatest(round(i.quantity), 0)::integer,
         'adjustment', 'Opening stock carried over from schema v1'
  from legacy_v1.inventory as i
  join public.products as p on p.id = i.product_id
  where i.quantity > 0;
end;
$$;
