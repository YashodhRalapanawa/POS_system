-- ============================================================================
-- Migration: 202610080001_role_permissions_management.sql
-- Description: Role permissions assignment RPC, columns, and seed permissions
-- ============================================================================

-- 1. Ensure module and name columns exist on public.permissions
alter table public.permissions
  add column if not exists module text,
  add column if not exists name text;

-- 2. Populate module and name for existing permissions where null
update public.permissions
set
  module = case
    when key like 'roles.%' then 'Roles'
    when key like 'users.%' then 'Users'
    when key like 'products.%' then 'Products'
    when key like 'categories.%' then 'Categories'
    when key like 'suppliers.%' then 'Suppliers'
    when key like 'inventory.%' then 'Inventory'
    when key like 'customers.%' then 'Customers'
    when key like 'orders.%' then 'Orders'
    when key like 'invoices.%' then 'Invoices'
    when key like 'returns.%' then 'Returns'
    when key like 'reports.%' then 'Reports'
    when key like 'pos.%' then 'POS'
    when key like 'dashboard.%' then 'Dashboard'
    when key like 'settings.%' then 'Settings'
    else initcap(split_part(key, '.', 1))
  end,
  name = case
    when name is not null then name
    when key = 'roles.view' then 'View Roles'
    when key = 'roles.create' then 'Create Roles'
    when key = 'roles.manage' then 'Manage Roles'
    when key = 'roles.assign_permissions' then 'Assign Role Permissions'
    when key = 'users.manage' then 'Manage Users'
    when key = 'products.view' then 'View Products'
    when key = 'products.manage' then 'Manage Products'
    when key = 'categories.view' then 'View Categories'
    when key = 'categories.manage' then 'Manage Categories'
    when key = 'suppliers.view' then 'View Suppliers'
    when key = 'suppliers.manage' then 'Manage Suppliers'
    when key = 'inventory.view' then 'View Inventory'
    when key = 'inventory.manage' then 'Manage Inventory'
    when key = 'customers.view' then 'View Customers'
    when key = 'customers.manage' then 'Manage Customers'
    when key = 'orders.view' then 'View Orders'
    when key = 'invoices.view' then 'View Invoices'
    when key = 'returns.view' then 'View Returns'
    when key = 'returns.process' then 'Process Returns'
    when key = 'reports.view' then 'View Reports'
    when key = 'pos.use' then 'Use POS Register'
    when key = 'dashboard.view' then 'View Dashboard'
    when key = 'settings.manage' then 'Manage Store Settings'
    else initcap(replace(split_part(key, '.', 2), '_', ' ')) || ' ' || initcap(split_part(key, '.', 1))
  end
where module is null or name is null;

-- 3. Register role management permissions (roles.view, roles.create, roles.assign_permissions)
insert into public.permissions (key, description, module, name)
values
  ('roles.view', 'View roles and their permission assignments', 'Roles', 'View Roles'),
  ('roles.create', 'Create new custom roles in the business', 'Roles', 'Create Roles'),
  ('roles.assign_permissions', 'Assign and update permissions for roles', 'Roles', 'Assign Role Permissions')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 4. Grant role permissions to the Admin role
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where r.name = 'Admin'
  and p.key in ('roles.view', 'roles.create', 'roles.assign_permissions', 'roles.manage')
on conflict (role_id, permission_id) do nothing;

-- 5. Atomic RPC function to update role permissions
create or replace function public.update_role_permissions(
  p_role_id smallint,
  p_permission_ids smallint[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role record;
  v_invalid_count integer;
  v_critical_missing text[];
  v_perm_id smallint;
begin
  -- 1. Check if role exists
  select * into v_role from public.roles where id = p_role_id;
  if not found then
    return jsonb_build_object(
      'success', false,
      'error_code', 'ROLE_NOT_FOUND',
      'message', 'Role not found'
    );
  end if;

  -- 2. Validate all permission IDs exist
  if p_permission_ids is not null and array_length(p_permission_ids, 1) > 0 then
    select count(*) into v_invalid_count
    from unnest(p_permission_ids) as requested_id
    where requested_id not in (select id from public.permissions);

    if v_invalid_count > 0 then
      return jsonb_build_object(
        'success', false,
        'error_code', 'INVALID_PERMISSION_IDS',
        'message', 'One or more permission IDs do not exist'
      );
    end if;
  end if;

  -- 3. System role protection: Admin role cannot lose critical role management permissions
  if v_role.name = 'Admin' or v_role.code = 'ADMIN' then
    select coalesce(array_agg(p.key), array[]::text[]) into v_critical_missing
    from public.permissions p
    where p.key in ('roles.view', 'roles.create', 'roles.assign_permissions')
      and (p_permission_ids is null or p.id != all(p_permission_ids));

    if array_length(v_critical_missing, 1) > 0 then
      return jsonb_build_object(
        'success', false,
        'error_code', 'ADMIN_CRITICAL_PERMISSIONS_PROTECTED',
        'message', format('Cannot remove critical permissions (%s) from Admin role', array_to_string(v_critical_missing, ', '))
      );
    end if;
  end if;

  -- 4. Atomic sync
  delete from public.role_permissions
  where role_id = p_role_id
    and (p_permission_ids is null or permission_id != all(p_permission_ids));

  if p_permission_ids is not null and array_length(p_permission_ids, 1) > 0 then
    foreach v_perm_id in array p_permission_ids loop
      insert into public.role_permissions (role_id, permission_id)
      values (p_role_id, v_perm_id)
      on conflict (role_id, permission_id) do nothing;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Role permissions updated successfully'
  );
end;
$$;

grant execute on function public.update_role_permissions(smallint, smallint[]) to authenticated;
grant execute on function public.update_role_permissions(smallint, smallint[]) to service_role;
