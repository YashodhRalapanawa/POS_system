-- ============================================================================
-- Migration: 202610080003_users_view_permission.sql
-- Description: Register 'users.view' permission and assign to Admin & Manager
-- ============================================================================

-- 1. Ensure 'users.view' permission exists
insert into public.permissions (key, description, module, name)
values
  ('users.view', 'View staff list and profiles', 'Users', 'View Staff')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Grant 'users.view' to Admin and Manager roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where (r.name in ('Admin', 'Manager') or r.code in ('ADMIN', 'MANAGER'))
  and p.key = 'users.view'
on conflict (role_id, permission_id) do nothing;
