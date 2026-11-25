# Migration Phase 2 — Approval Package

Status: **superseded by `docs/MIGRATION_PACKAGE_APPROVAL.md`. Nothing has been applied.**

> The corrected draft package is now in `supabase/migrations/drafts/` and is documented in `docs/MIGRATION_PACKAGE_APPROVAL.md`. This file is retained as historical audit context only.

## 1. Requested operations

Apply these existing SQL files, in order, to the connected Supabase project only after approval:

1. `supabase/migrations/20261124000100_core_schema.sql`
2. `supabase/migrations/20261124000200_functions.sql`
3. `supabase/migrations/20261124000300_new_tables_rls.sql`

The demo migration (`20261125000100_demo_system.sql`) is **excluded** from this request. The private demo must be redesigned first.

## 2. Exact objects affected

### Added tables

`stock_movements`, `suppliers`, `purchases`, `purchase_items`, `supplier_payments`, `customers`, `customer_payments`, `sales`, `sale_items`, `expenses`, `audit_logs`.

### Added sequences

`sale_receipt_seq`, `purchase_ref_seq`.

### Added columns on existing tables

- `businesses`: `phone`, `email`, `address`, `logo_url`, `currency`, `timezone`, `allow_negative_stock`, `receipt_footer`, `updated_at`.
- `business_members`: `full_name`, `updated_at`.
- `business_invitations`: `revoked_at`.
- `products`: `barcode`, `unit`, `low_stock_level`, `image_url`, `is_archived`, `updated_at`.

All use `add column if not exists`; no existing column is dropped or retyped. Live probing shows `address`, `timezone`, `updated_at`, `image_url`, `is_archived`, `business_members.updated_at`, and `business_invitations.revoked_at` are the columns that would actually be added.

### Added functions

`app_is_business_member`, `app_has_business_role`, `create_business`, `get_my_workspace`, `complete_sale`, `cancel_sale`, `adjust_stock`, `record_purchase`, `record_supplier_payment`, `record_customer_payment`, `list_business_invitations`, `revoke_business_invitation`, `update_member_role`, `remove_member`.

### Added RLS/policies

RLS enabled and SELECT/role-scoped policies created for the new tables listed above. Policies on pre-existing tables are not touched by this package.

## 3. Expected effects

- `sales` and the other operational tables become visible in the PostgREST schema cache, resolving `PGRST205` for the dashboard/POS.
- POS, inventory, purchases, customers, and expenses gain transactional RPCs with `auth.uid()`-derived authorization.
- New columns (`products.is_archived`, `businesses.timezone`, etc.) become available.
- No existing rows are modified by these statements.

## 4. Risks and required pre-checks

1. **`get_my_workspace()` already exists.** `20261124000200_functions.sql` uses `CREATE OR REPLACE FUNCTION public.get_my_workspace()` with an 11-column return type. PostgreSQL cannot change the return type of an existing function with `CREATE OR REPLACE`. A catalog query must confirm the existing signature/return type. If it differs, the migration must be changed to a new function name plus an application update, or an explicitly approved drop/recreate.
2. **`create_business`, `is_business_member`, `is_business_owner` may exist under other signatures.** Catalog verification is required before `CREATE OR REPLACE`.
3. **Existing permissive policies** on `products`, `stores`, `businesses`, `business_members`, and `business_invitations` may already allow broader access. New restrictive policies do not narrow them. `manual_review_existing_tables_rls.sql` must be reviewed separately.
4. **Default `EXECUTE` grants** may expose mutating RPCs to `anon`. Add explicit `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon` before approval.
5. **Foreign keys assume `products.id` is `uuid`** — verified. `products.quantity` is `numeric` — verified, so fractional quantities are safe.
6. **Business invitations** use `token_hash`; no legacy `token` column was found — verified.
7. **Purchase deletion** in the UI has no matching drafted RLS policy. Phase 6 must replace deletion with a reversal RPC; this migration package does not fix that.

## 5. Rollback plan

These are new objects and additive columns, so rollback is possible before operational data is written:

- Drop the policies created by `20261124000300_new_tables_rls.sql`.
- Drop the functions listed above (the pre-existing `get_my_workspace()` must **not** be dropped unless its replacement is confirmed safe).
- Drop the new tables and sequences.
- Drop only the added columns from existing tables, using `drop column if exists` for exactly the lists in section 2.

Rollback is destructive to any data written after migration. Once real sales/expenses/customer records exist, rollback must instead be a reviewed data migration, not a blind drop. A full Supabase backup/PITR checkpoint must be confirmed before execution.

## 6. Production data protection

- SALI COMPANY (`5693fc87-fdc9-49ff-a701-8db97aa656a6`) and its owner (`d6202869-34f9-47a6-8e8a-dabc59d1e6cb`) are not referenced by any statement in this package.
- No migration deletes, updates, or reads row data.
- No auth users, businesses, memberships, or demo data are created.
- No authentication configuration is changed.
- No service-role credential is present in the repository or used by the application.

## 7. Approval required

I will not run any of the above until you explicitly approve a specific operation. The next safe step is for an administrator to run the read-only catalog queries in `manual_demo_security_review.sql` (or equivalent) and share the sanitized results, or provide a service-role key through a secure channel for catalog-only inspection.
