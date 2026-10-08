-- Migration: Barcode Uniqueness and Lookup Index
-- Description: Task 15 Barcode Management index enforcement

-- 1. Ensure unique index on (store_id, barcode) for non-empty barcodes
create unique index if not exists products_store_barcode_key
  on public.products (store_id, barcode)
  where barcode is not null and barcode <> '';

-- 2. Ensure index for fast barcode lookup by store
create index if not exists products_store_barcode_lookup_idx
  on public.products (store_id, barcode);
