-- ============================================================================
-- Migration: 202610080007_supplier_permissions.sql
-- Description: Register dynamic supplier permissions:
--              suppliers.view, suppliers.create, suppliers.update
-- ============================================================================

-- 1. Register supplier permissions in public.permissions
insert into public.permissions (key, description, module, name)
values
  ('suppliers.view', 'Browse and view supplier profiles and vendor catalogs', 'Suppliers', 'View Suppliers'),
  ('suppliers.create', 'Create new vendor and supplier profiles', 'Suppliers', 'Create Supplier'),
  ('suppliers.update', 'Edit supplier details and activate/deactivate vendor accounts', 'Suppliers', 'Update Supplier')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Grant supplier permissions to Admin and Manager roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where (r.name in ('Admin', 'Manager') or r.code in ('ADMIN', 'MANAGER'))
  and p.key in ('suppliers.view', 'suppliers.create', 'suppliers.update')
on conflict (role_id, permission_id) do nothing;
