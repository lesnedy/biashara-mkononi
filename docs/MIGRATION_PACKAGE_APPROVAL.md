# Migration Package — Approval Request

Status: **DRAFT PACKAGE. NOTHING HAS BEEN APPLIED TO LIVE SUPABASE.**

This document requests approval for the corrected, complete operational database package. It replaces the earlier Phase 2 draft package for approval purposes. The original migration files under `supabase/migrations/` were left untouched; all new work is isolated in `supabase/migrations/drafts/`.

No live row, schema, policy, grant, trigger, auth setting, or SALI COMPANY record has been changed. No service-role key was used. No demo data was provisioned.

---

## 1. Files in this package

| Order | File | Purpose |
|---|---|---|
| 0 | `supabase/migrations/drafts/00_catalog_preflight.draft.sql` | Read-only administrator queries. Must be run and results returned before approval of any DDL. |
| 1 | `supabase/migrations/drafts/01_core_schema.draft.sql` | Additive columns, 11 operational tables, sequences, indexes, reconciliation view. |
| 2 | `supabase/migrations/drafts/02_functions.draft.sql` | Secure transactional RPCs, team helpers, financial guards, explicit grants. |
| 3 | `supabase/migrations/drafts/03_rls_and_grants.draft.sql` | RLS and privilege hardening for all new tables. |
| 4 | `supabase/migrations/drafts/04_optional_integrity.draft.sql` | Read-only duplicate-membership check; optional guarded unique index; reference-only note on existing-table restrictive policies. |

The private demo migration remains **excluded**. Demo work requires a separate redesign and separate approval.

---

## 2. Dependency order

1. **Administrator runs file 0** in the Supabase SQL editor and returns sanitized results.
2. Confirm `get_my_workspace()` exact result type. If it differs from the 11 columns consumed by `src/lib/workspace.ts`, **stop**. Use a new function name plus a coordinated app change, or request separate approval to drop/recreate.
3. Confirm duplicate membership count from file 0 Section A is `0` before any unique index is considered.
4. Confirm a backup/PITR checkpoint exists.
5. Apply file 1 — `01_core_schema.draft.sql`.
6. Apply file 2 — `02_functions.draft.sql`.
7. Apply file 3 — `03_rls_and_grants.draft.sql`.
8. Run read-only verification. Do **not** run live authorization or financial tests against production.
9. Apply file 4 Section B only if explicitly approved and the duplicate check is `0`.
10. Perform full acceptance in a separate isolated Supabase test project.

---

## 3. Exact object changes

### 3.1 Columns added to existing tables

- `businesses`: `address`, `timezone`, `updated_at`.
- `business_members`: `updated_at`.
- `business_invitations`: `revoked_at`.
- `stores`: `location`, `updated_at`.
- `products`: `store_id`, `image_url`, `is_archived`, `updated_at`.

All additions use `add column if not exists`. No existing column is dropped, renamed, retyped, or updated.

`products.barcode`, `products.unit`, `products.low_stock_level`, `products.updated_at`, `businesses.phone/email/logo_url/currency/allow_negative_stock/receipt_footer` and `business_members.full_name` are already live according to `docs/SCHEMA_INVENTORY.md`; the draft does not duplicate or alter them.

### 3.2 Tables created

`stock_movements`, `suppliers`, `purchases`, `purchase_items`, `supplier_payments`, `customers`, `customer_payments`, `sales`, `sale_items`, `expenses`, `audit_logs`.

Every operational table has `business_id` with a foreign key to `public.businesses`. Child tables also carry `business_id` so RLS can be evaluated directly. `sales`, `sale_items`, `stock_movements`, `purchases`, `purchase_items`, `supplier_payments`, `customer_payments` and `audit_logs` are ledger tables: clients receive `SELECT` only; writes occur through audited RPCs. `suppliers`, `customers` and `expenses` are RLS-managed master data because the current app writes to them directly.

### 3.3 Sequences and view

- Sequences: `sale_receipt_seq`, `purchase_ref_seq`.
- View: `payment_activity` with `security_invoker = true`, unifying completed sales, customer payments and supplier payments. No separate generic `payments` table is created because the app has no such table contract.

### 3.4 Indexes and constraints

Foreign keys from every new table to its parent; check constraints for status, positive quantities/amounts, non-negative balances and payment limits; unique receipt/reference numbers per business; partial unique idempotency indexes; tenant/date indexes for dashboard, reports and inventory queries; composite unique indexes on `(business_id, id)` for existing parents where needed by future composite references.

The optional unique index on `business_members (business_id, user_id)` is gated by a duplicate-count check and requires separate approval.

### 3.5 Functions created or hardened

New helpers:

- `app_is_business_member(uuid)`
- `app_has_business_role(uuid, text[])`

Transactional RPCs:

- `create_business(text, text)` — created only if the exact signature is absent; existing function is otherwise preserved.
- `complete_sale(...)` — server-owned prices, role-gated discounts, credit-limit checks, stock locks, atomic sale/items/stock/customer-balance/audit writes.
- `cancel_sale(uuid, text)` — restores stock and customer balance, audits the reversal.
- `adjust_stock(...)` — audited stock movement with negative-stock protection.
- `record_purchase(...)` — atomic purchase/items/stock/supplier-balance/payment/audit writes.
- `record_supplier_payment(...)` — validates remaining balance, updates purchase status and supplier balance.
- `record_customer_payment(...)` — idempotent, validates outstanding balance and updates customer balance.
- `get_dashboard_summary(uuid, integer)` and `get_report_summary(uuid, date, date)` — server-authoritative aggregates for later app integration.
- `delete_purchase(uuid)` — safe replacement for the app's current direct purchase delete; reverses stock and supplier balance and audits the deletion.
- `list_business_invitations`, `revoke_business_invitation`, `update_member_role`, `remove_member` — server-authorized team administration.

### 3.6 Functions explicitly preserved

- `get_my_workspace()` is **not** replaced. Its 11 exposed columns match the draft return shape, but exact result type equality still requires catalog confirmation before any `CREATE OR REPLACE`.
- `get_business_invitation(p_token)` is preserved.
- `accept_business_invitation(p_token)` is preserved and was **not** invoked during verification.
- `add_business_owner()` and `handle_new_user()` are preserved; trigger behavior remains unverified.

### 3.7 RLS and grants

- RLS is enabled on all 11 new tables.
- Read policies use `app_is_business_member(business_id)`.
- Write policies on `suppliers`, `customers` and `expenses` enforce the same role gates as the UI, in the database.
- `audit_logs` is readable only by owners and admins.
- Ledger tables have no client write policy.
- `purchases` has no client delete policy; deletion must move to `delete_purchase()`.
- `PUBLIC` and `anon` privileges are revoked from all new tables, view, sequences and functions.
- `TRUNCATE` is revoked from `authenticated` because RLS does not control it.
- All new functions grant `EXECUTE` only to `authenticated`.

---

## 4. Reconciliation with application modules

| Module | Status after migration | Notes |
|---|---|---|
| Dashboard | Data queries become satisfiable | Reads `sales`, `expenses`, `products`, `customers`, `sale_items`; columns match. Safe unavailable-state remains until tables exist. |
| POS / Sales | Integrated | `complete_sale` and `cancel_sale` argument/return shapes match `src/app/sales/page.tsx`. Server enforces stock, payment, discount and credit checks. |
| Products | Schema columns complete | Direct insert/update/archive/delete still target `products`; existing-table RLS/grants are unverified and unchanged. |
| Inventory | Integrated | `stock_movements` columns and `adjust_stock` arguments match the page; movement types `in`, `out`, `adjustment`, `damage` are supported. |
| Purchases | Integrated except delete | `record_purchase` and `record_supplier_payment` match. Direct `purchases.delete()` must be changed to `delete_purchase()` after approval. |
| Expenses | Integrated | Table columns and RLS match direct insert/delete usage; `created_by` is checked against `auth.uid()`. |
| Customers | Integrated | Table columns, `record_customer_payment` arguments and idempotency key type match, including the app's non-UUID fallback key. |
| Reports | Data queries become satisfiable | Reads `sales`, `sale_items`, `expenses`, `purchases`; all selected columns are present. |
| Team | Mostly integrated | New RPCs match the page. Existing `business_members`/`business_invitations` policies remain unverified; invitation creation still writes directly in the API route. |
| Workspace/auth | Preserved | `get_my_workspace()` and registration/invitation functions are not replaced. |

No application code was edited in this package.

---

## 5. Security explanation

- Authorization is derived from `auth.uid()` inside `SECURITY DEFINER` functions with `search_path = ''`.
- Helpers use new `app_*` names to avoid collision with unknown existing `is_business_member`/`is_business_owner` functions.
- Business isolation is enforced twice: every RPC checks membership/role for `p_business_id`, and every new table's RLS checks `business_id` against the same helpers.
- Financial mutations are atomic: a failed line item, stock check, payment check or audit insert rolls back the whole operation.
- Client-supplied prices are ignored by `complete_sale`; prices come from locked product rows.
- Discounts are rejected for cashiers unless an owner/admin/manager performs them.
- Negative payments, negative quantities, cross-business product/supplier/customer/store references and credit-limit overruns are rejected.
- Idempotency keys prevent duplicate customer payments and are available for the other financial RPCs.
- SALI COMPANY (`5693fc87-fdc9-49ff-a701-8db97aa656a6`) is not referenced, modified, seeded or tested by any draft.

---

## 6. Expected results after approval and application

- The setup warnings disappear once the missing tables and RPCs appear in the schema cache.
- Dashboard and Reports render real stored values instead of unavailable state.
- Completing a sale creates `sales`, `sale_items`, `stock_movements`, `audit_logs` rows, decreases product stock, and increases customer balance for credit sales.
- Recording a purchase creates purchase records, increases product stock, and increases supplier balance for unpaid portions.
- Recording a customer payment decreases the customer balance and creates a traceable `customer_payments` row.
- Recording an expense affects dashboard/report profit calculations.
- Cross-business and unauthorized operations fail with SQL errors rather than silently writing data.

These are expected results, **not observed results**. They must be verified in an isolated Supabase test environment.

---

## 7. Rollback plan

### Before operational data exists

Within a maintenance window, and only with explicit approval:

1. Drop the view `public.payment_activity`.
2. Drop policies created by file 3 (explicit policy names listed in the file).
3. Revoke grants added by files 2 and 3.
4. Drop the functions created by file 2. Do **not** drop pre-existing functions.
5. Drop the 11 new tables and two sequences.
6. Drop only the additive columns created by file 1.

### After any operational data exists

Do **not** run structural rollback. Dropping tables would destroy financial history. Use PITR/backup restore to a separate environment, reconcile, and only then consider a coordinated production restore. `get_my_workspace()` must never be dropped as part of routine rollback.

---

## 8. Unresolved decisions and risks

1. **Catalog metadata is still unavailable.** Exact signatures, ownership, `SECURITY DEFINER`, volatility, `search_path`, policy definitions, triggers and grants on pre-existing objects remain unverified. File 0 must be run by an administrator.
2. **Existing-table policies are unknown.** New permissive policies cannot narrow existing permissive access. If broad policies exist on `products`, `stores`, `businesses`, `business_members` or `business_invitations`, a restrictive-policy change requires separate approval after catalog review.
3. **`get_my_workspace()` exact result type is unconfirmed.** Projection evidence is positive, but `pg_get_function_result()` must be checked.
4. **Triggers are unverified.** `add_business_owner()` and `handle_new_user()` may already create owner memberships. `create_business()` checks for an existing membership before inserting.
5. **Purchase delete requires an app change.** The current page directly deletes from `purchases`; the new RLS intentionally blocks that. Change it to call `delete_purchase()` after approval.
6. **Dashboard/report aggregates are prepared but not wired.** The current pages still calculate metrics in the browser from RLS-protected rows. Replacing those calculations with `get_dashboard_summary()`/`get_report_summary()` is a separate app-deployment decision.
7. **Demo remains disabled.** No demo tables, accounts, roles or seed data are included.
8. **No live acceptance testing occurred.** Isolation, persistence, transaction rollback, reconciliation and authorization tests must run in an isolated project before production readiness can be claimed.

---

## 9. Approval request

I request explicit approval for these specific operations, one at a time:

1. Administrator execution of the read-only queries in `00_catalog_preflight.draft.sql` and return of sanitized results.
2. Application of `01_core_schema.draft.sql`.
3. Application of `02_functions.draft.sql` only after the `get_my_workspace()` result-type check passes.
4. Application of `03_rls_and_grants.draft.sql`.
5. Application of the guarded unique index in `04_optional_integrity.draft.sql` only if the duplicate check returns `0`.
6. A separate approval for the app change that replaces direct purchase deletion with `delete_purchase()`.
7. A separate approval for provisioning an isolated Supabase test project and running acceptance tests.

**No live database operation will be performed until the specific operation is explicitly approved.**

---

## 10. Local quality checks

These checks were run after preparing the draft package. No live database was contacted.

| Check | Result |
|---|---|
| `npm test` | **Passed** — 16 tests, 16 passed, 0 failed. |
| `npm run lint` | **Passed** — ESLint completed with no errors or warnings. |
| `npx tsc --noEmit --incremental false` | **Passed** — no TypeScript errors. |
| `npm run build` | **Passed** — Next.js 16.4.6 production build compiled successfully; 20 pages generated; no build errors. |

These results cover the local repository only. They do **not** mean the database modules are working, because the migrations have not been approved or applied.
