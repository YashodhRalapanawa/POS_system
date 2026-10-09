-- ============================================================================
-- Migration: 202610070001_roles_and_permissions.sql
-- Description: Dynamic roles & permissions enhancement
-- ============================================================================

-- 1. Enhance public.roles table with code, system flags, and timestamps
alter table public.roles
  add column if not exists code text,
  add column if not exists is_system boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- 2. Backfill codes and system flags for existing initial roles
update public.roles
set
  code = upper(name),
  is_system = true
where name in ('Admin', 'Manager', 'Cashier') and (code is null or is_system = false);

-- Set any remaining null codes
update public.roles
set code = upper(name)
where code is null;

-- Add unique constraint on role code if not exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'roles_code_key' and conrelid = 'public.roles'::regclass
  ) then
    alter table public.roles add constraint roles_code_key unique (code);
  end if;
end;
$$;

-- 3. Register role management permissions
insert into public.permissions (key, description)
values
  ('roles.view', 'View roles and their permission assignments'),
  ('roles.create', 'Create new custom roles in the business'),
  ('roles.manage', 'Edit custom roles and configure role permissions')
on conflict (key) do update
set description = excluded.description;

-- 4. Grant role permissions to the Admin role
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where r.name = 'Admin'
  and p.key in ('roles.view', 'roles.create', 'roles.manage')
on conflict (role_id, permission_id) do nothing;
