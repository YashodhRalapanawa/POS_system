-- Staff accounts were being created as Admins of a new business.
--
-- Supabase Auth's admin createUser inserts the auth.users row first and writes app_metadata in a
-- second statement, so the AFTER INSERT trigger never saw store_id/role and fell through to the
-- self sign-up branch. Now:
--   * handle_new_auth_user() only handles self sign-up (user metadata carries business_name);
--     any other new auth user gets no profile and cannot use the app.
--   * create_staff_profile() creates a staff profile in an existing store. Only the service role
--     (the backend's POST /api/users) can call it.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_business_name text := nullif(trim(v_meta ->> 'business_name'), '');
  v_username text := nullif(trim(v_meta ->> 'username'), '');
  v_full_name text := coalesce(nullif(trim(v_meta ->> 'full_name'), ''), new.email);
  v_business_type text := coalesce(nullif(trim(v_meta ->> 'business_type'), ''), 'Retail');
  v_currency text := upper(coalesce(nullif(trim(v_meta ->> 'currency'), ''), 'USD'));
  v_business_id uuid;
  v_store_id uuid;
  v_register_id uuid;
  v_role_id smallint;
begin
  if v_business_name is null then
    return new;
  end if;

  if v_username is not null and v_username !~ '^[A-Za-z0-9_]{4,20}$' then
    raise exception 'Username must be 4-20 letters, numbers or underscores';
  end if;
  if v_business_type not in ('Retail', 'Electronics', 'Grocery', 'Pharmacy', 'Restaurant', 'Other') then
    v_business_type := 'Other';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    v_currency := 'USD';
  end if;

  insert into public.businesses (name, business_type, phone, country, currency, owner_user_id)
  values (
    v_business_name,
    v_business_type,
    coalesce(v_meta ->> 'business_phone', ''),
    coalesce(nullif(trim(v_meta ->> 'country'), ''), 'Sri Lanka'),
    v_currency,
    new.id
  )
  returning id into v_business_id;

  insert into public.stores (business_id, name, code, phone, country)
  select b.id, b.name, 'STORE-001', b.phone, b.country
  from public.businesses as b where b.id = v_business_id
  returning id into v_store_id;

  insert into public.registers (store_id, name)
  values (v_store_id, 'Register #01')
  returning id into v_register_id;

  insert into public.store_settings (store_id, currency, default_register_id)
  values (v_store_id, v_currency, v_register_id);

  select r.id into v_role_id from public.roles as r where r.name = 'Admin';
  insert into public.users (id, business_id, store_id, role_id, full_name, email, username, all_registers)
  values (new.id, v_business_id, v_store_id, v_role_id, v_full_name, new.email, v_username, true);

  insert into public.user_preferences (user_id) values (new.id);

  insert into public.customers (store_id, code, name, customer_type, is_walk_in)
  values (v_store_id, 'CUS-001', 'Walk-in Customer', 'Individual', true);

  return new;
end;
$$;

-- register_access is a register name, 'All Registers' or 'None' (the Users screen's values).
create or replace function public.create_staff_profile(
  p_user_id uuid,
  p_store_id uuid,
  p_role text,
  p_full_name text,
  p_username text default null,
  p_employee_code text default null,
  p_phone text default '',
  p_register_access text default 'None'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_business_id uuid;
  v_role_id smallint;
  v_username text := nullif(trim(p_username), '');
  v_access text := coalesce(nullif(trim(p_register_access), ''), 'None');
begin
  select a.email into v_email from auth.users as a where a.id = p_user_id;
  if v_email is null then
    raise exception 'Auth user % does not exist', p_user_id;
  end if;
  if exists (select 1 from public.users as u where u.id = p_user_id) then
    raise exception 'This account already has a staff profile';
  end if;

  select s.business_id into v_business_id
  from public.stores as s where s.id = p_store_id and s.status = 'Active';
  if v_business_id is null then
    raise exception 'The store for this staff account is not available';
  end if;

  select r.id into v_role_id from public.roles as r
  where r.name = case when p_role = 'Administrator' then 'Admin' else p_role end;
  if v_role_id is null then
    raise exception 'Unknown role %', p_role;
  end if;

  insert into public.users (
    id, business_id, store_id, role_id, full_name, email, username, employee_code, phone, all_registers
  )
  values (
    p_user_id, v_business_id, p_store_id, v_role_id,
    coalesce(nullif(trim(p_full_name), ''), v_email), v_email, v_username,
    nullif(trim(p_employee_code), ''), coalesce(p_phone, ''), v_access = 'All Registers'
  );

  insert into public.user_register_access (user_id, register_id)
  select p_user_id, r.id from public.registers as r
  where r.store_id = p_store_id and r.name = v_access;

  insert into public.user_preferences (user_id) values (p_user_id);
end;
$$;

revoke execute on function public.create_staff_profile(uuid, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_staff_profile(uuid, uuid, text, text, text, text, text, text)
  to service_role;
