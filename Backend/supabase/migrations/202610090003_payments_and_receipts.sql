-- ============================================================================
-- Migration: 202610090003_payments_and_receipts.sql
-- Description: Payments table invoice_id column, permissions, and RLS policies
--              for Payment Processing & Sale Completion (Developer 2 - Stage 2.1).
-- ============================================================================

-- 1. Register payment and receipt permissions
insert into public.permissions (key, description, module, name)
values
  ('payments.view', 'View payment records and transaction status', 'Taxes & Finance', 'View Payments'),
  ('payments.create', 'Process and record POS customer payments', 'Taxes & Finance', 'Create Payments'),
  ('payments.manage', 'Update or void payment records', 'Taxes & Finance', 'Manage Payments'),
  ('receipts.view', 'View and print sales receipts', 'Taxes & Finance', 'View Receipts')
on conflict (key) do update
set
  description = excluded.description,
  module = coalesce(public.permissions.module, excluded.module),
  name = coalesce(public.permissions.name, excluded.name);

-- 2. Grant payment & receipt permissions to Admin, Manager, and Cashier
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_new.id
from public.roles r
cross join public.permissions p_new
where p_new.key in ('payments.view', 'payments.create', 'receipts.view')
  and (
    upper(r.name) in ('ADMIN', 'MANAGER', 'CASHIER')
    or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id and p.key in ('pos.use', 'orders.view', 'invoices.view', 'pos_orders.create')
    )
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_new.id
from public.roles r
cross join public.permissions p_new
where p_new.key = 'payments.manage'
  and (
    upper(r.name) in ('ADMIN', 'MANAGER')
    or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id and p.key in ('orders.manage', 'settings.manage')
    )
  )
on conflict (role_id, permission_id) do nothing;

-- 3. Enhance public.payments with optional invoice_id and notes
alter table public.payments
  add column if not exists invoice_id uuid references public.invoices (id) on delete restrict,
  add column if not exists notes text not null default '';

create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_store_status_idx on public.payments (store_id, payment_status);

-- Backfill invoice_id on existing payments from public.invoices matching order_id
update public.payments p
set invoice_id = i.id
from public.invoices i
where p.order_id = i.order_id
  and p.store_id = i.store_id
  and p.invoice_id is null;

-- 4. Update RLS policies on public.payments
alter table public.payments enable row level security;

drop policy if exists "staff read payments" on public.payments;
create policy "staff read payments" on public.payments
  for select to authenticated
  using (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['payments.view', 'payments.create', 'payments.manage', 'pos.use', 'orders.view', 'invoices.view', 'reports.view']))
  );

drop policy if exists "staff create payments" on public.payments;
create policy "staff create payments" on public.payments
  for insert to authenticated
  with check (
    store_id = (select public.current_user_store_id())
    and (select public.has_any_permission(array['payments.create', 'payments.manage', 'pos.use']))
  );

