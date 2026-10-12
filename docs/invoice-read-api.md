# Invoice read APIs

The Next.js backend exposes GET `/api/invoices` and GET `/api/invoices/{uuid}`. Both require a real Supabase bearer token and `invoices.view` permission through the shared authorization helper. The frontend now uses the existing `/api/auth/login` endpoint, restores sessions through `/api/auth/me`, and attaches the returned token to invoice requests. A live Supabase account is still needed for an end-to-end test. Do not disable authorization to work around this.

The user-scoped Supabase client enforces RLS. Both endpoints additionally constrain invoices to the authenticated profile's store, including administrators. A valid UUID outside that store returns the same 404 as an unknown invoice. Missing store assignment returns 403.

List query parameters:

- `page`: positive integer, default 1, maximum 100000.
- `limit`: 1–100, default 20.
- `search`: invoice number, historical customer name or code. Up to 100 letters/numbers/spaces or `@+._-`; PostgREST expression punctuation is rejected.
- `status`: Paid, Pending, Overdue, Cancelled, Refunded.
- `customerType`: Individual or Business.
- `startDate`, `endDate`: valid YYYY-MM-DD dates, inclusive UTC calendar boundaries.

Success is `{success:true,data:{invoices:[],pagination:{page,limit,total,totalPages}}}` or `{success:true,data:{invoice:{...}}}` for detail. Validation errors return 400, missing session 401, denied access 403, missing invoice 404, database failures 500. Database messages and credentials are not returned. Responses disable caching.

Amounts and customer information come from the invoice snapshot; detail items come from the original order items, not current product prices. Currency comes from the original order. Only Completed payment rows contribute to paidAmount and payment method summaries. This is not a refund ledger or payment-processing implementation. No rows are written and no migrations are applied.

Prerequisites: existing v2 invoices/orders/order_items/payments schema and the order currency columns from migration 202610080015 must be applied. The invoice-to-order foreign key must be available in the Supabase schema cache. This has not been verified against a live database by the automated unit suite.

The invoice UI fetches server-paginated rows and loads details on demand. Loading, authorization, failure and empty states are distinct. Mock KPI totals, simulated Mark as Paid and unsupported creation/export actions are not presented as working features. Payment-method filtering is not part of this first read-only API. The existing preview remains a preview, not a PDF/printing implementation.

Docker sets `API_PROXY_TARGET=http://backend:3000` for Vite; local development defaults to localhost:3000. Recreate the frontend service after changing its Compose environment.

Run unit tests from the repository root:

```sh
node --test Backend/tests/invoices.test.mjs
```

Tests inject authorization/database doubles, covering failures, store restrictions, historical details, empty results, pagination/filter validation and payment summaries. They do not prove live RLS or foreign-key embedding. Before release, use two test stores and real authenticated sessions to exercise list/detail, denied access, frontend error/empty/loading states and invoice previews. Do not create fake paid records in production for this test.
