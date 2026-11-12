-- ============================================================================
-- Migration: 202610090002_invoices_and_items.sql
-- Description: Invoice Items table, Invoice permissions, and RLS policies
--              for Invoice Processing (Developer 2 - Stage 1.2).
-- ============================================================================

-- 1. Register invoice permissions
insert into public.permissions (key, description, module, name)
values
  ('invoices.view', 'View and search sales invoices and billing details', 'Taxes & Finance', 'View Invoices'),
  ('invoices.create', 'Generate sales invoices from POS orders', 'Taxes & Finance', 'Create Invoices'),
  ('invoices.manage', 'Update invoice status and manage billing records', 'Taxes & Finance', 'Manage Invoices')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Grant invoice permissions to roles (Admin, Manager, Cashier can create/view POS invoices; Admin/Manager can manage)
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_new.id
from public.roles r
cross join public.permissions p_new
where p_new.key in ('invoices.view', 'invoices.create')
  and (
    upper(r.name) in ('ADMIN', 'MANAGER', 'CASHIER')
    or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id and p.key in ('pos.use', 'orders.view', 'pos_orders.view', 'pos_orders.create')
    )
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_new.id
from public.roles r
cross join public.permissions p_new
where p_new.key = 'invoices.manage'
  and (
    upper(r.name) in ('ADMIN', 'MANAGER')
    or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id and p.key in ('orders.manage', 'settings.manage')
    )
  )
on conflict (role_id, permission_id) do nothing;

-- 3. Enhance public.invoices with optional created_by and notes if not present
alter table public.invoices
  add column if not exists created_by uuid references public.users (id) on delete set null,
  add column if not exists notes text not null default '',
  add column if not exists currency_code text not null default 'USD';

-- Ensure composite unique (id, store_id) on public.invoices for foreign keys
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_id_store_id_key'
  ) then
    alter table public.invoices add constraint invoices_id_store_id_key unique (id, store_id);
  end if;
end $$;

-- 4. Create public.invoice_items table linked to invoices and order_items
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  invoice_id uuid not null,
  order_item_id uuid,
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
  foreign key (invoice_id, store_id) references public.invoices (id, store_id) on delete cascade,
  foreign key (product_id, store_id) references public.products (id, store_id) on delete restrict
);

create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);
create index if not exists invoice_items_product_idx on public.invoice_items (product_id);
create index if not exists invoice_items_order_item_idx on public.invoice_items (order_item_id);

-- 5. Enable RLS on public.invoice_items
alter table public.invoice_items enable row level security;

drop policy if exists "staff read invoice items" on public.invoice_items;
create policy "staff read invoice items" on public.invoice_items
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['invoices.view', 'invoices.create', 'invoices.manage', 'orders.view', 'pos_orders.view', 'returns.view', 'reports.view']))
  );

drop policy if exists "staff manage invoice items" on public.invoice_items;
create policy "staff manage invoice items" on public.invoice_items
  for all to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['invoices.create', 'invoices.manage', 'pos.use']))
  )
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['invoices.create', 'invoices.manage', 'pos.use']))
  );

-- 6. Backfill invoice_items from order_items for any existing invoices that have no invoice_items yet
insert into public.invoice_items (
  store_id, invoice_id, order_item_id, product_id, product_name, sku,
  quantity, unit_price, unit_cost, discount_amount, tax_rate, tax_amount, line_total, created_at
)
select
  i.store_id,
  i.id,
  oi.id,
  oi.product_id,
  oi.product_name,
  oi.sku,
  oi.quantity,
  oi.unit_price,
  oi.unit_cost,
  oi.discount_amount,
  oi.tax_rate,
  oi.tax_amount,
  oi.line_total,
  oi.created_at
from public.invoices i
join public.order_items oi on oi.order_id = i.order_id and oi.store_id = i.store_id
where not exists (
  select 1 from public.invoice_items ii where ii.invoice_id = i.id
);

