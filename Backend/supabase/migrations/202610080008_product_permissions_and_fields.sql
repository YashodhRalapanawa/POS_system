-- Migration: Add product permissions and unit_of_measure column if not exists
-- Description: Task 14 Product Management incremental schema update

-- 1. Ensure unit_of_measure column exists on public.products
alter table public.products
  add column if not exists unit_of_measure text not null default 'PCS';

-- 2. Register dynamic permissions for products
insert into public.permissions (key, description) values
  ('products.view', 'View products'),
  ('products.create', 'Create new products'),
  ('products.update', 'Edit and activate/deactivate products')
on conflict (key) do nothing;

-- 3. Grant permissions to Admin and Manager roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where (r.name = 'Admin' and p.key in ('products.view', 'products.create', 'products.update'))
   or (r.name = 'Manager' and p.key in ('products.view', 'products.create', 'products.update'))
on conflict do nothing;
