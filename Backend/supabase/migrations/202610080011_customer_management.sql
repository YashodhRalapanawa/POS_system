-- ============================================================================
-- Migration: 202610080011_customer_management.sql
-- Description: Dynamic customer permissions (customers.view, customers.create,
--              customers.update), role assignments, and RLS policy updates.
-- ============================================================================

-- 1. Register dynamic customer permissions
insert into public.permissions (key, description, module, name)
values
  ('customers.view', 'Browse, view, and search customer profiles', 'Customers', 'View Customers'),
  ('customers.create', 'Create new customer profiles', 'Customers', 'Create Customer'),
  ('customers.update', 'Edit customer profiles and activate/deactivate accounts', 'Customers', 'Update Customer')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Dynamically assign new permissions to roles that possess customers.manage
insert into public.role_permissions (role_id, permission_id)
select rp.role_id, p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id = rp.permission_id
cross join public.permissions p_new
where p_old.key = 'customers.manage'
  and p_new.key in ('customers.view', 'customers.create', 'customers.update')
on conflict (role_id, permission_id) do nothing;

-- 3. Update RLS policies for public.customers to recognize granular permissions
drop policy if exists "managers insert customers" on public.customers;
create policy "authorized insert customers" on public.customers for insert to authenticated
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['customers.create', 'customers.manage']))
  );

drop policy if exists "managers update customers" on public.customers;
create policy "authorized update customers" on public.customers for update to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['customers.update', 'customers.manage']))
  )
  with check (store_id = (select public.current_user_store_id()));

-- 4. Helpful performance and search indexes
create index if not exists customers_store_status_idx on public.customers (store_id, status);
create index if not exists customers_store_code_idx on public.customers (store_id, code);
create index if not exists customers_store_name_idx on public.customers (store_id, name);
