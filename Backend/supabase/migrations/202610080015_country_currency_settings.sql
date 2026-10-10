-- ============================================================================
-- Migration: 202610080015_country_currency_settings.sql
-- Description: Country and Currency configuration schema enhancements,
--              order currency integrity columns, and settings permissions.
-- ============================================================================

-- 1. Register dynamic settings permissions
insert into public.permissions (key, description, module, name)
values
  ('settings.view', 'View store country, currency, and operational settings', 'Settings', 'View Settings'),
  ('settings.update', 'Modify store country, currency, and operational settings', 'Settings', 'Update Settings')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Dynamically assign new permissions to roles that possess settings.manage or are Admin
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_new.id
from public.roles r
cross join public.permissions p_new
where p_new.key in ('settings.view', 'settings.update')
  and (
    upper(r.name) = 'ADMIN'
    or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id and p.key = 'settings.manage'
    )
  )
on conflict (role_id, permission_id) do nothing;

-- 3. Enhance store_settings table with country_code and currency_code
alter table public.store_settings
  add column if not exists country_code text not null default 'LK' check (country_code ~ '^[A-Z]{2}$'),
  add column if not exists currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$');

-- Sync existing currency to currency_code if different
update public.store_settings
set currency_code = currency
where currency is not null and currency ~ '^[A-Z]{3}$' and currency_code <> currency;

-- 4. Enhance businesses and stores with country_code and currency_code
alter table public.businesses
  add column if not exists country_code text default 'LK' check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add column if not exists currency_code text default 'USD' check (currency_code is null or currency_code ~ '^[A-Z]{3}$');

alter table public.stores
  add column if not exists country_code text default 'LK' check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add column if not exists currency_code text default 'USD' check (currency_code is null or currency_code ~ '^[A-Z]{3}$');

-- 5. Enhance orders table to preserve authoritative currency code per order
alter table public.orders
  add column if not exists currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  add column if not exists currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$');

-- Backfill orders currency from store_settings where available
update public.orders o
set
  currency_code = coalesce(s.currency_code, s.currency, 'USD'),
  currency = coalesce(s.currency, s.currency_code, 'USD')
from public.store_settings s
where s.store_id = o.store_id
  and (o.currency_code = 'USD' or o.currency = 'USD');

-- 6. Update store_settings RLS policies for granular view and update
drop policy if exists "staff read store settings" on public.store_settings;
create policy "staff read store settings" on public.store_settings
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['settings.view', 'settings.manage', 'pos.use', 'orders.view']))
  );

drop policy if exists "staff update store settings" on public.store_settings;
create policy "staff update store settings" on public.store_settings
  for update to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['settings.update', 'settings.manage']))
  )
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['settings.update', 'settings.manage']))
  );

-- 7. Trigger to ensure orders always record authoritative currency code on creation
create or replace function public.trg_orders_set_authoritative_currency()
returns trigger as $$
declare
  v_currency text;
begin
  select coalesce(s.currency_code, s.currency, 'USD')
  into v_currency
  from public.store_settings s
  where s.store_id = new.store_id;

  if v_currency is not null and btrim(v_currency) <> '' then
    new.currency_code := v_currency;
    new.currency := v_currency;
  else
    new.currency_code := coalesce(new.currency_code, new.currency, 'USD');
    new.currency := new.currency_code;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists set_order_currency_on_insert on public.orders;
create trigger set_order_currency_on_insert
  before insert on public.orders
  for each row
  execute function public.trg_orders_set_authoritative_currency();

