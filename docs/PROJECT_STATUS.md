# Biashara Mkononi — Project Status

Audit date: 2026-11-25
Audited by: OpenCode engineering agent
Scope: repository source, local tests, and read-only introspection of the connected Supabase project (`ixjlbrzwrzruiuqnvllu`).

> This document reports observed state. It does not claim that unverified workflows work in production.

## 1. Live database state (read-only)

Observed through the public PostgREST endpoint with the anon/publishable key. No writes, migrations, auth changes, or row-level tests against real business data were performed.

### Tables reachable

`businesses`, `profiles`, `business_members`, `business_invitations`, `stores`, `products`.

### Tables absent from the schema cache

`suppliers`, `purchases`, `purchase_items`, `supplier_payments`, `customers`, `customer_payments`, `sales`, `sale_items`, `expenses`, `stock_movements`, `audit_logs`, `demo_businesses`, `demo_accounts`, `demo_reset_logs`.

### Functions

- Confirmed callable with the signatures the app uses: `get_my_workspace()`, `get_business_invitation(p_token)`.
- Returned `PGRST202` (no matching signature in schema cache) for: `is_business_member`, `is_business_owner`, `create_business`, `app_is_business_member`, `app_has_business_role`, `complete_sale`, `cancel_sale`, `adjust_stock`, `record_purchase`, `record_supplier_payment`, `record_customer_payment`, `list_business_invitations`, `revoke_business_invitation`, `update_member_role`, `remove_member`, `demo_current_status`.
- `accept_business_invitation` was not invoked because it is mutating; its live state is unverified.
- Triggers, grants, policy definitions, and function ownership could not be read: no service-role key or Supabase management token is configured, and the OpenAPI/root metadata endpoint returns HTTP 401 with the anon key.

### Data types verified (via coercion errors, `limit=0`)

- `products.id`, `businesses.id`, `business_members.user_id`: `uuid`.
- `products.quantity`, `products.buying_price`, `products.selling_price`: `numeric`.
- `business_invitations.token_hash` exists; a legacy `token` column was not found.

### Column differences on existing tables

| Table | Present but not in original inventory | Expected by migrations/app but absent |
| --- | --- | --- |
| `businesses` | `phone`, `email`, `logo_url`, `currency`, `allow_negative_stock`, `receipt_footer`, `created_at` | `address`, `timezone`, `updated_at` |
| `products` | `unit`, `low_stock_level`, `barcode`, `created_at`, `updated_at` | `image_url`, `is_archived` |
| `business_members` | `full_name`, `created_at` | `updated_at` |
| `business_invitations` | `token_hash`, `created_at` | `revoked_at`, legacy `token` |
| `stores`, `profiles` | basic expected columns present | `profiles.email` not present |

## 2. Exact root cause of the dashboard error

The dashboard queries `public.sales`. `public.sales` does not exist in the live schema cache. PostgREST returns:

`PGRST205: Could not find the table 'public.sales' in the schema cache`

The same condition affects `sale_items`, `customers`, `expenses`, `stock_movements`, `purchases`, `suppliers`, `customer_payments`, and all RPC-based mutations. The prepared migration files under `supabase/migrations/` were never applied. The UI therefore renders zero/partial metrics because several pages turn missing-query errors into empty arrays.

## 3. Feature classification

Legend: **F** fully functional and verified end-to-end, **P** partially functional, **U** UI only, **B** broken, **M** missing.

| Area | Status | Basis |
| --- | --- | --- |
| Login page, language switcher, protected-route proxy | P | Build and routes verified; live auth flow not exercised. |
| Registration / new business onboarding | B | Calls `create_business`, absent from schema cache. |
| Workspace resolution | P | `get_my_workspace()` exists; owner fallback exists; role coverage depends on memberships. |
| Products catalogue | P | Table exists; `is_archived` and `image_url` columns absent, so POS filtering/full edit form can fail. |
| Inventory and stock movements | B | `stock_movements` and `adjust_stock` absent; fallback direct update has no audit trail. |
| POS / sales | B | `sales`, `sale_items`, `customers`, `complete_sale`, `cancel_sale` absent. |
| Purchases / suppliers | B | All related tables and RPCs absent. |
| Expenses | B | `expenses` table absent. |
| Customers / credit | B | `customers`, `customer_payments`, `record_customer_payment` absent. |
| Dashboard | B | Depends on absent sales/expenses/customer tables; errors become zeros. |
| Reports | B | Depends on absent sales/sale_items/expenses/purchases; errors become zeros. |
| Team management | P | Core tables exist; admin RPCs absent; invitation acceptance unverified. |
| Private demo system | M | No live demo tables/functions/accounts; docs explicitly say not provisioned. |
| Bilingual UI | P | Translation keys exist across pages; no automated coverage for every string. |
| Automated tests | P | 10 local Node tests pass; no integration/RLS/transaction tests. |
| Deployment/backup docs | M | No deployment or backup/recovery guide. |

## 4. Quality gates (local)

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm test` | Pass (16 tests) |
| `npm run build` | Pass (Next 16.4.6, Turbopack, Cache Components) |
| `npx tsc --noEmit --incremental false` | Pass |
| Live migrations | Not applied |
| Live auth/RLS/transaction tests | Not run |
| Real-world acceptance testing | **Not started** — see `docs/ACCEPTANCE_TESTING.md` |
| Production readiness | **Not ready** |

## 5. Local hardening completed after audit

No live database objects were changed. The following local application changes were made and verified:

- Added a shared `safeErrorDetail()` helper and used it across operational pages and login/registration, so raw Supabase/PostgREST messages are no longer rendered to users.
- Dashboard and reports now treat any failed critical query as unavailable instead of silently rendering zero metrics.
- Removed unaudited client-side fallbacks that directly changed `products.quantity`, `customers.balance`, `business_members.role`, or deleted memberships/invitations when an RPC was missing. Missing RPCs now show a setup error and fail closed.
- Added automated tests that enforce these error-display and no-fallback guarantees.

These changes improve safety and honesty of error reporting; they do not make the missing database objects functional. Phase 2 still requires approval.

## 6. Production data protection

The audit used only read-only `GET` requests with `limit=0` or deliberately invalid arguments that PostgREST rejected before function execution. No row belonging to SALI COMPANY (`5693fc87-fdc9-49ff-a701-8db97aa656a6`) or any other business was read, modified, or used for testing. No service-role key was present or used.
