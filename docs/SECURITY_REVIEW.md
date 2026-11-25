# Security Review — Biashara Mkononi

Last reconciled: 2026-11-25
Scope: static review plus read-only live schema probing. No live authorization, RLS, or cross-tenant tests were executed. No production data was accessed.

## 1. Critical findings

### S-01 — Authorization boundary is not live

Role checks in `src/lib/permissions.ts` and `can(...)` calls in pages are client-side only. The database-side helpers and RPCs that derive role from `auth.uid()` are absent from the schema cache. Until they are applied and verified, a browser can attempt direct table reads/writes using any `business_id` it can construct.

Affected: sales, inventory, purchases, expenses, customers, dashboard, reports, team.

### S-02 — Missing RLS coverage for all operational tables

`sales`, `sale_items`, `stock_movements`, `suppliers`, `purchases`, `purchase_items`, `supplier_payments`, `customers`, `customer_payments`, `expenses`, and `audit_logs` do not exist. Their drafted RLS policies in `20261124000300_new_tables_rls.sql` are therefore not active.

### S-03 — Existing-table policies are unverified

Policies on `businesses`, `business_members`, `products`, `stores`, and `business_invitations` could not be read with the anon key. Permissive policies OR together, so adding new restrictive policies does not narrow existing access. `manual_review_existing_tables_rls.sql` must be reviewed and executed only after approval.

### S-04 — Unaudited fallback mutations (locally mitigated)

The audited fallback paths in `inventory/page.tsx`, `customers/page.tsx`, `products/page.tsx`, and `team/page.tsx` have been removed locally. Missing RPCs now fail closed with a setup notice instead of directly changing quantity, balance, role, or deleting memberships/invitations. This is not a substitute for the approved RPC/RLS layer; it only prevents the browser from bypassing it.

### S-05 — `create_business` absent

New users cannot obtain a workspace through the intended RPC. The fallback relies on a `businesses.owner_id` query plus client metadata, which is not a duplicate-safe onboarding mechanism.

## 2. High findings

### S-06 — Raw database errors rendered to users (locally mitigated)

Raw Supabase error messages are no longer interpolated into page notices. `safeErrorDetail()` in `src/lib/supabase/errors.ts` maps missing tables/functions, permission errors, common auth errors, and unknown errors to short localized phrases. A test scans every `src/app/**/*.tsx` file to prevent regressions.

### S-07 — Shared demo design is not acceptable

The existing `docs/DEMO_SYSTEM.md` describes five shared public accounts and a shared business. The new requirement is per-visitor isolated demo identity/business. Shared credentials must not be deployed. Anonymous auth is disabled and must remain disabled unless explicitly approved.

### S-08 — Purchase deletion has no matching drafted policy

`20261124000300_new_tables_rls.sql` only creates a `SELECT` policy on `purchases`, but `src/app/purchases/page.tsx` performs a direct `DELETE`. After RLS is applied, that delete will be denied unless a deliberate, role-scoped policy or a reversal RPC is added. Deleting financial records is also poor practice; prefer a cancellation/reversal transaction.

### S-09 — Default function EXECUTE grants

The function migration grants `EXECUTE` to `authenticated`, but PostgreSQL default grants may still leave `EXECUTE` available to `PUBLIC`/`anon`. Mutating RPCs check `auth.uid()`, so anonymous callers should fail, but explicit `REVOKE EXECUTE ... FROM PUBLIC, anon` is recommended hardening.

## 3. Medium findings

- `SECURITY DEFINER` functions use `set search_path = public`. Safer hardening is `set search_path = ''` with fully qualified object names.
- Function ownership and `SECURITY DEFINER` flags of pre-existing functions are unverified.
- Financial metrics are computed in the browser over capped result sets; errors become `[]`, producing false zeros. This is both an integrity and trust problem.
- The customer payment idempotency key is browser-generated. It is acceptable for replay protection only, not as an authorization control.
- No audit-log UI exists even though an `audit_logs` table is drafted.
- `src/proxy.ts` checks authentication only; layouts/pages must not be treated as authorization boundaries.

## 4. Positive observations

- The publishable key is correctly used in the browser; no service-role key is configured or referenced by client code.
- `.env.local` contains only URL and publishable key. No secret was exposed during this audit.
- Prepared RPCs consistently call `auth.uid()` and validate membership/role before mutations.
- Prepared schema is additive; no `DROP`, `TRUNCATE`, or destructive statements in the auto-applied migration files.
- Production build, lint, type-check, and local tests pass.

## 5. Required before production readiness

1. Catalog verification of policies, grants, triggers, function signatures/ownership.
2. Approved application of the core schema, functions, and RLS migrations.
3. Removal or gating of unaudited fallbacks.
4. Server-side metric aggregation with explicit error states.
5. Private demo redesign and approval before provisioning.
6. Integration tests on an isolated project, including two-business isolation and role enforcement.
7. Full acceptance testing in an isolated Supabase environment, including authorization, isolation, financial reconciliation, and error-recovery scenarios.
8. Backup and recovery verification.

SALI COMPANY and all existing real data were untouched. No live cross-user or isolation tests were run.
