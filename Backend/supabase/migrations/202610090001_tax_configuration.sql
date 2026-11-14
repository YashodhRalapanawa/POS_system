-- ============================================================================
-- Migration: 202610090001_tax_configuration.sql
-- Description: Tax Configuration table, RLS policies, permissions, and
--              default store tax seeding (Developer 2 - Stage 1).
-- ============================================================================

-- 1. Register tax permissions
insert into public.permissions (key, description, module, name)
values
  ('taxes.view', 'View tax rates and store tax configuration', 'Taxes & Finance', 'View Taxes'),
  ('taxes.manage', 'Create, update, and activate/deactivate tax configurations', 'Taxes & Finance', 'Manage Taxes')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Grant taxes.view to Admin, Manager, Cashier (anyone with pos.use, invoices.view, or settings.view)
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_new.id
from public.roles r
cross join public.permissions p_new
where p_new.key = 'taxes.view'
  and (
    upper(r.name) in ('ADMIN', 'MANAGER', 'CASHIER')
    or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id and p.key in ('pos.use', 'invoices.view', 'settings.view', 'settings.manage')
    )
  )
on conflict (role_id, permission_id) do nothing;

-- Grant taxes.manage to Admin and Manager (or roles with settings.manage)
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_new.id
from public.roles r
cross join public.permissions p_new
where p_new.key = 'taxes.manage'
  and (
    upper(r.name) in ('ADMIN', 'MANAGER')
    or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id and p.key in ('settings.manage', 'settings.update')
    )
  )
on conflict (role_id, permission_id) do nothing;

-- 3. Create public.taxes table
create table if not exists public.taxes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  code text not null,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  rate numeric(5, 2) not null default 0 check (rate between 0 and 100),
  is_inclusive boolean not null default false,
  is_default boolean not null default false,
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_by uuid references public.users (id) on delete set null,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code),
  unique (id, store_id),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists taxes_store_status_idx on public.taxes (store_id, status);
create unique index if not exists taxes_one_default_per_store_idx
  on public.taxes (store_id)
  where is_default = true and status = 'Active';

-- Trigger for updated_at
drop trigger if exists set_updated_at on public.taxes;
create trigger set_updated_at
  before update on public.taxes
  for each row execute function public.set_updated_at();

-- 4. Enable RLS on public.taxes
alter table public.taxes enable row level security;

drop policy if exists "staff read taxes" on public.taxes;
create policy "staff read taxes" on public.taxes
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['taxes.view', 'taxes.manage', 'pos.use', 'invoices.view', 'settings.view', 'settings.manage']))
  );

drop policy if exists "staff manage taxes" on public.taxes;
create policy "staff manage taxes" on public.taxes
  for all to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['taxes.manage', 'settings.manage', 'settings.update']))
  )
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['taxes.manage', 'settings.manage', 'settings.update']))
  );

-- 5. Seed default tax configurations for existing stores from store_settings
insert into public.taxes (store_id, code, name, description, rate, is_inclusive, is_default, status)
select
  s.store_id,
  'TAX-STD',
  'Standard Tax',
  'Default store tax rate',
  coalesce(s.default_tax_rate, 15.00),
  coalesce(s.prices_include_tax, false),
  true,
  'Active'
from public.store_settings s
on conflict (store_id, code) do nothing;

insert into public.taxes (store_id, code, name, description, rate, is_inclusive, is_default, status)
select
  s.store_id,
  'TAX-ZERO',
  'Zero Rated (0%)',
  'Tax-exempt or zero-rated items',
  0.00,
  false,
  false,
  'Active'
from public.store_settings s
on conflict (store_id, code) do nothing;

