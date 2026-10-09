-- ============================================================================
-- Migration: 202610080002_staff_role_assignment.sql
-- Description: Dynamic staff role assignment, permissions, and atomic RPC
-- ============================================================================

-- 1. Ensure users.assign_role permission exists
insert into public.permissions (key, description, module, name)
values
  ('users.assign_role', 'Assign and update roles for staff members', 'Users', 'Assign Staff Roles')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Grant users.assign_role to the Admin role
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where r.name = 'Admin' and p.key = 'users.assign_role'
on conflict (role_id, permission_id) do nothing;

-- 3. Ensure index exists on public.users(role_id) for fast role lookups
create index if not exists users_role_idx on public.users (role_id);

-- 4. Atomic RPC function to assign/update staff role
create or replace function public.update_staff_role(
  p_user_id uuid,
  p_role_id smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_new_role record;
  v_current_role record;
  v_admin_count integer;
  v_admin_role_ids smallint[];
begin
  -- Check user exists
  select * into v_user from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object(
      'success', false,
      'error_code', 'USER_NOT_FOUND',
      'message', 'Staff member not found'
    );
  end if;

  -- Check new role exists
  select * into v_new_role from public.roles where id = p_role_id;
  if not found then
    return jsonb_build_object(
      'success', false,
      'error_code', 'ROLE_NOT_FOUND',
      'message', 'Role not found'
    );
  end if;

  -- Check new role is active
  if v_new_role.is_active = false then
    return jsonb_build_object(
      'success', false,
      'error_code', 'INACTIVE_ROLE',
      'message', 'Cannot assign an inactive role'
    );
  end if;

  -- Identify current role
  select * into v_current_role from public.roles where id = v_user.role_id;

  -- System Self-Protection: Prevent demoting the last active Administrator
  if v_current_role.name = 'Admin' or v_current_role.code = 'ADMIN' then
    if v_new_role.name != 'Admin' and v_new_role.code != 'ADMIN' then
      select coalesce(array_agg(id), array[]::smallint[]) into v_admin_role_ids
      from public.roles
      where name = 'Admin' or code = 'ADMIN';

      select count(*) into v_admin_count
      from public.users
      where role_id = any(v_admin_role_ids) and status = 'Active';

      if v_admin_count <= 1 then
        return jsonb_build_object(
          'success', false,
          'error_code', 'LAST_ADMIN_PROTECTED',
          'message', 'Cannot demote the last remaining active Administrator'
        );
      end if;
    end if;
  end if;

  -- Perform role update
  update public.users
  set
    role_id = p_role_id,
    updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Staff role updated successfully'
  );
end;
$$;

grant execute on function public.update_staff_role(uuid, smallint) to authenticated;
grant execute on function public.update_staff_role(uuid, smallint) to service_role;
