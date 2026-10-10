-- ============================================================================
-- Migration: 202610080004_users_create_permission.sql
-- Description: Register 'users.create' permission and assign to Admin & Manager
-- ============================================================================

-- 1. Ensure 'users.create' permission exists
insert into public.permissions (key, description, module, name)
values
  ('users.create', 'Create and invite new staff members', 'Users', 'Create Staff')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Grant 'users.create' to Admin and Manager roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where (r.name in ('Admin', 'Manager') or r.code in ('ADMIN', 'MANAGER'))
  and p.key = 'users.create'
on conflict (role_id, permission_id) do nothing;
