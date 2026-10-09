-- ============================================================================
-- Migration: 202610080005_users_update_permission.sql
-- Description: Register 'users.update' permission and assign to Admin & Manager
-- ============================================================================

-- 1. Ensure 'users.update' permission exists
insert into public.permissions (key, description, module, name)
values
  ('users.update', 'Edit staff profile details and account status', 'Users', 'Edit Staff')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Grant 'users.update' to Admin and Manager roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where (r.name in ('Admin', 'Manager') or r.code in ('ADMIN', 'MANAGER'))
  and p.key = 'users.update'
on conflict (role_id, permission_id) do nothing;
