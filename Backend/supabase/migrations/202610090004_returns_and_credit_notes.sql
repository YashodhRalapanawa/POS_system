-- ============================================================================
-- Migration: 202610090004_returns_and_credit_notes.sql
-- Description: Returns trigger updates for service-role / lowercase order status,
--              Credit Notes & Credit Note Items tables, permissions, and RLS
--              (Developer 2 - Stage 3.1).
-- ============================================================================

-- 1. Register return and credit note permissions
insert into public.permissions (key, description, module, name)
values
  ('returns.view', 'View returns and request new ones', 'Returns & Credits', 'View Returns'),
  ('returns.create', 'Create customer return requests', 'Returns & Credits', 'Create Returns'),
  ('returns.process', 'Approve, reject and complete returns', 'Returns & Credits', 'Process Returns'),
  ('credit_notes.view', 'View credit notes issued for returns', 'Returns & Credits', 'View Credit Notes'),
  ('credit_notes.create', 'Generate and issue credit notes from returns', 'Returns & Credits', 'Create Credit Notes')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Grant permissions to roles
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_new.id
from public.roles r
cross join public.permissions p_new
where p_new.key in ('returns.view', 'returns.create', 'credit_notes.view')
  and (
    upper(r.name) in ('ADMIN', 'MANAGER', 'CASHIER')
    or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id and p.key in ('pos.use', 'orders.view', 'invoices.view', 'returns.view')
    )
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_new.id
from public.roles r
cross join public.permissions p_new
where p_new.key in ('returns.process', 'credit_notes.create')
  and (
    upper(r.name) in ('ADMIN', 'MANAGER')
    or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id and p.key in ('returns.process', 'orders.manage', 'settings.manage')
    )
  )
on conflict (role_id, permission_id) do nothing;

-- 3. Enhance public.returns with invoice_id and relax refund_method constraint to include Bank Transfer
alter table public.returns
  add column if not exists invoice_id uuid references public.invoices (id) on delete restrict;

alter table public.returns drop constraint if exists returns_refund_method_check;
alter table public.returns add constraint returns_refund_method_check
  check (refund_method in ('Original Payment', 'Cash', 'Card', 'Bank Transfer', 'Store Credit'));

-- 4. Update prepare_return() and guard_return_update() so they support:
--    a) case-insensitive order status ('completed' or 'Completed' or 'refunded')
--    b) service-role calls from Next.js API routes (where auth.uid() is null and actor ID is passed on row)
create or replace function public.prepare_return()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders as o
  where o.id = new.order_id and o.store_id = new.store_id;
  if not found then
    raise exception 'Order not found in this store';
  end if;
  if lower(v_order.status) not in ('completed', 'refunded') then
    raise exception 'Only completed orders can be returned (current status: %)', v_order.status;
  end if;

  new.customer_id := coalesce(new.customer_id, v_order.customer_id);
  new.status := coalesce(nullif(new.status, ''), 'Pending');
  new.requested_by := coalesce((select auth.uid()), new.requested_by);
  new.created_at := coalesce(new.created_at, now());
  return new;
end;
$$;

create or replace function public.guard_return_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if pg_trigger_depth() > 1 then
    new.updated_at := now();
    return new;
  end if;

  new.id := old.id;
  new.store_id := old.store_id;
  new.order_id := old.order_id;
  new.customer_id := old.customer_id;
  new.return_number := old.return_number;
  new.requested_by := old.requested_by;
  new.created_at := old.created_at;

  if new.status is distinct from old.status then
    -- Enforce DB-level permission only when called via user JWT (service_role checks in Next.js route)
    if v_uid is not null and not public.has_permission('returns.process') then
      raise exception 'You do not have permission to process returns' using errcode = '42501';
    end if;

    if old.status = 'Pending' and new.status = 'Approved' then
      if not exists (select 1 from public.return_items as ri where ri.return_id = old.id) then
        raise exception 'Add at least one item before approving the return';
      end if;
      new.approved_by := coalesce(v_uid, new.approved_by, old.approved_by);
      new.approved_at := coalesce(new.approved_at, now());
    elsif old.status in ('Pending', 'Approved') and new.status = 'Rejected' then
      if coalesce(trim(new.rejection_reason), '') = '' then
        new.rejection_reason := coalesce(nullif(trim(new.notes), ''), 'Rejected by staff');
      end if;
      new.rejected_by := coalesce(v_uid, new.rejected_by, old.rejected_by);
      new.rejected_at := coalesce(new.rejected_at, now());
    elsif old.status in ('Pending', 'Approved') and new.status = 'Completed' then
      new.approved_by := coalesce(old.approved_by, v_uid, new.approved_by);
      new.approved_at := coalesce(old.approved_at, now());
      new.processed_by := coalesce(v_uid, new.processed_by, old.processed_by);
      new.completed_at := coalesce(new.completed_at, now());

      -- Insert Return stock movements only if not already recorded for this return
      if not exists (
        select 1 from public.stock_movements sm
        where sm.reference_id = old.id and sm.adjustment_type = 'Return'
      ) then
        insert into public.stock_movements (
          store_id, product_id, adjustment_type, quantity, reference_type, reference_id, notes, created_by
        )
        select ri.store_id, ri.product_id, 'Return', ri.quantity, 'return', old.id, 'Return ' || old.return_number, new.processed_by
        from public.return_items as ri
        where ri.return_id = old.id and ri.restock;
      end if;
    else
      raise exception 'A return cannot move from % to %', old.status, new.status;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 5. Create public.credit_notes and public.credit_note_items tables
create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  return_id uuid not null unique,
  invoice_id uuid references public.invoices (id) on delete restrict,
  order_id uuid not null,
  customer_id uuid,
  credit_note_number text not null,
  issue_date timestamptz not null default now(),
  reason text not null default '',
  refund_method text not null default 'Original Payment',
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  remaining_amount numeric(12, 2) not null default 0 check (remaining_amount >= 0),
  status text not null default 'Issued' check (status in ('Issued', 'Applied', 'Refunded', 'Cancelled')),
  notes text not null default '',
  issued_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, credit_note_number),
  unique (id, store_id),
  foreign key (return_id, store_id) references public.returns (id, store_id) on delete restrict,
  foreign key (order_id, store_id) references public.orders (id, store_id) on delete restrict
);

create table if not exists public.credit_note_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  credit_note_id uuid not null,
  return_item_id uuid,
  order_item_id uuid,
  product_id uuid not null,
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  foreign key (credit_note_id, store_id) references public.credit_notes (id, store_id) on delete cascade,
  foreign key (product_id, store_id) references public.products (id, store_id) on delete restrict
);

create index if not exists credit_notes_store_date_idx on public.credit_notes (store_id, issue_date desc);
create index if not exists credit_notes_invoice_idx on public.credit_notes (invoice_id);
create index if not exists credit_notes_order_idx on public.credit_notes (order_id);
create index if not exists credit_note_items_cn_idx on public.credit_note_items (credit_note_id);

drop trigger if exists set_updated_at on public.credit_notes;
create trigger set_updated_at
  before update on public.credit_notes
  for each row execute function public.set_updated_at();

-- 6. Enable RLS on credit_notes and credit_note_items
alter table public.credit_notes enable row level security;
alter table public.credit_note_items enable row level security;

drop policy if exists "staff read credit notes" on public.credit_notes;
create policy "staff read credit notes" on public.credit_notes
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['credit_notes.view', 'returns.view', 'invoices.view', 'reports.view', 'pos.use']))
  );

drop policy if exists "staff manage credit notes" on public.credit_notes;
create policy "staff manage credit notes" on public.credit_notes
  for all to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['credit_notes.create', 'returns.process', 'pos.use']))
  )
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['credit_notes.create', 'returns.process', 'pos.use']))
  );

drop policy if exists "staff read credit note items" on public.credit_note_items;
create policy "staff read credit note items" on public.credit_note_items
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['credit_notes.view', 'returns.view', 'invoices.view', 'reports.view', 'pos.use']))
  );

drop policy if exists "staff manage credit note items" on public.credit_note_items;
create policy "staff manage credit note items" on public.credit_note_items
  for all to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['credit_notes.create', 'returns.process', 'pos.use']))
  )
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['credit_notes.create', 'returns.process', 'pos.use']))
  );

