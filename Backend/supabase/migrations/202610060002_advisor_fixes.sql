-- Fixes from the Supabase advisors after 202610060001_pos_schema_v2.sql.
--
-- 1. username_available() was callable by anonymous visitors through /rest/v1/rpc, which lets
--    anyone probe which usernames exist. The backend checks usernames with the service role instead.
-- 2. Foreign keys without a covering index. The store-scoped keys are (x_id, store_id), so the
--    single-column indexes from v2 did not cover them.

revoke execute on function public.username_available(text) from anon, authenticated;
grant execute on function public.username_available(text) to service_role;

create index if not exists businesses_owner_user_idx on public.businesses (owner_user_id);
create index if not exists users_business_idx on public.users (business_id);
create index if not exists role_permissions_permission_idx on public.role_permissions (permission_id);

create index if not exists store_settings_default_register_idx on public.store_settings (default_register_id, store_id);
create index if not exists store_settings_updated_by_idx on public.store_settings (updated_by);

create index if not exists products_category_store_idx on public.products (category_id, store_id);
create index if not exists products_supplier_store_idx on public.products (supplier_id, store_id);
create index if not exists inventory_product_store_idx on public.inventory (product_id, store_id);
create index if not exists stock_movements_product_store_idx on public.stock_movements (product_id, store_id);

create index if not exists shifts_register_store_idx on public.shifts (register_id, store_id);
create index if not exists shifts_opened_by_idx on public.shifts (opened_by);
create index if not exists shifts_closed_by_idx on public.shifts (closed_by);

create index if not exists orders_customer_store_idx on public.orders (customer_id, store_id);
create index if not exists orders_register_store_idx on public.orders (register_id, store_id);
create index if not exists order_items_order_store_idx on public.order_items (order_id, store_id);
create index if not exists order_items_product_store_idx on public.order_items (product_id, store_id);
create index if not exists payments_order_store_idx on public.payments (order_id, store_id);
create index if not exists payments_processed_by_idx on public.payments (processed_by);
create index if not exists invoices_order_store_idx on public.invoices (order_id, store_id);
create index if not exists invoices_customer_store_idx on public.invoices (customer_id, store_id);

create index if not exists returns_order_store_idx on public.returns (order_id, store_id);
create index if not exists returns_customer_store_idx on public.returns (customer_id, store_id);
create index if not exists returns_requested_by_idx on public.returns (requested_by);
create index if not exists returns_approved_by_idx on public.returns (approved_by);
create index if not exists returns_processed_by_idx on public.returns (processed_by);
create index if not exists returns_rejected_by_idx on public.returns (rejected_by);
create index if not exists return_items_return_store_idx on public.return_items (return_id, store_id);
create index if not exists return_items_order_item_store_idx on public.return_items (order_item_id, store_id);
create index if not exists return_items_product_store_idx on public.return_items (product_id, store_id);
