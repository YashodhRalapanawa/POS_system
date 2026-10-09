-- Migration: Inventory Management permissions, constraints, and opening stock support
-- Description: Task 16 Inventory Management

-- 1. Register inventory.adjust permission
insert into public.permissions (key, description) values
  ('inventory.view', 'View stock levels and movements'),
  ('inventory.adjust', 'Enter opening stock and make stock adjustments')
on conflict (key) do nothing;

-- 2. Grant inventory permissions to Admin and Manager roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where (r.name = 'Admin' and p.key in ('inventory.view', 'inventory.adjust', 'inventory.manage'))
   or (r.name = 'Manager' and p.key in ('inventory.view', 'inventory.adjust', 'inventory.manage'))
on conflict do nothing;

-- 3. Relax reason check constraint on stock_movements to support descriptive reason strings
alter table public.stock_movements
  drop constraint if exists stock_movements_reason_check;

alter table public.stock_movements
  add constraint stock_movements_reason_check
  check (reason is null or length(trim(reason)) > 0);

-- 4. Extend adjustment_type constraint to allow 'Opening Stock'
alter table public.stock_movements
  drop constraint if exists stock_movements_adjustment_type_check;

alter table public.stock_movements
  add constraint stock_movements_adjustment_type_check
  check (adjustment_type in ('Add Stock', 'Remove Stock', 'Set Stock Level', 'Sale', 'Return', 'Received', 'Opening Stock'));

-- 5. Update apply_stock_movement trigger function to handle 'Opening Stock'
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_allow_negative boolean;
begin
  select i.current_stock into v_before
  from public.inventory as i
  where i.product_id = new.product_id and i.store_id = new.store_id
  for update;

  if not found then
    insert into public.inventory (store_id, product_id, current_stock)
    values (new.store_id, new.product_id, 0);
    v_before := 0;
  end if;

  if new.adjustment_type <> 'Set Stock Level' and new.adjustment_type <> 'Opening Stock' and new.quantity = 0 then
    raise exception 'Quantity must be greater than zero' using errcode = 'check_violation';
  end if;

  new.quantity_change := case new.adjustment_type
    when 'Add Stock' then new.quantity
    when 'Received' then new.quantity
    when 'Return' then new.quantity
    when 'Remove Stock' then -new.quantity
    when 'Sale' then -new.quantity
    when 'Set Stock Level' then new.quantity - v_before
    when 'Opening Stock' then new.quantity - v_before
  end;
  new.quantity_before := v_before;
  new.quantity_after := v_before + new.quantity_change;

  if new.quantity_after < 0 then
    select s.allow_negative_stock into v_allow_negative
    from public.store_settings as s where s.store_id = new.store_id;
    if not coalesce(v_allow_negative, false) then
      raise exception 'Not enough stock: % available, % requested', v_before, new.quantity
        using errcode = 'check_violation';
    end if;
  end if;

  new.created_by := coalesce((select auth.uid()), new.created_by);
  new.created_at := coalesce(new.created_at, now());

  update public.inventory
  set current_stock = new.quantity_after, updated_at = now()
  where product_id = new.product_id and store_id = new.store_id;

  return new;
end;
$$;
