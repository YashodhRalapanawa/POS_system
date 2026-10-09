-- ============================================================================
-- Migration: 202610080006_category_code_and_permissions.sql
-- Description: Add category code column, unique constraint, and register
--              categories.view, categories.create, categories.update permissions.
-- ============================================================================

-- 1. Ensure 'code' column exists on public.categories
alter table public.categories
add column if not exists code text;

-- 2. Add unique index on (store_id, lower(code)) when code is provided
create unique index if not exists categories_store_code_key
on public.categories (store_id, lower(code))
where code is not null;

-- 3. Register category permissions
insert into public.permissions (key, description, module, name)
values
  ('categories.view', 'Browse and view product categories', 'Categories', 'View Categories'),
  ('categories.create', 'Create new product categories', 'Categories', 'Create Category'),
  ('categories.update', 'Edit and activate/deactivate product categories', 'Categories', 'Update Category')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 4. Grant categories permissions to Admin and Manager roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where (r.name in ('Admin', 'Manager') or r.code in ('ADMIN', 'MANAGER'))
  and p.key in ('categories.view', 'categories.create', 'categories.update')
on conflict (role_id, permission_id) do nothing;
