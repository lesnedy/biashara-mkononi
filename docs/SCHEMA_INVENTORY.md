# Schema Inventory — Biashara Mkononi

Project ref: `ixjlbrzwrzruiuqnvllu`
Last reconciled: 2026-11-25
Method: read-only PostgREST probing with the anon/publishable key. Catalog views (`pg_catalog`, `information_schema`), policy definitions, grants, triggers, and function ownership were **not** readable with the configured credentials.

> Never treat this file as proof that a migration has been applied. Re-run the checks after each approved live change.

## 1. Live objects verified present

### Tables

| Table | Evidence |
| --- | --- |
| `public.businesses` | `GET /rest/v1/businesses?limit=0` → 200 |
| `public.profiles` | `GET /rest/v1/profiles?limit=0` → 200 |
| `public.business_members` | `GET /rest/v1/business_members?limit=0` → 200 |
| `public.business_invitations` | `GET /rest/v1/business_invitations?limit=0` → 200 |
| `public.stores` | `GET /rest/v1/stores?limit=0` → 200 |
| `public.products` | `GET /rest/v1/products?limit=0` → 200 |

### Functions callable with the app's signatures

| Function | Evidence |
| --- | --- |
| `get_my_workspace()` | `GET /rest/v1/rpc/get_my_workspace` → 200 |
| `get_business_invitation(p_token)` | `GET /rest/v1/rpc/get_business_invitation?p_token=...` → 200 |

### Column and type findings on existing tables

Existence checks used `select=<column>&limit=0`. Type checks used an invalid filter value with `limit=0`.

| Table | Columns confirmed | Columns absent |
| --- | --- | --- |
| `businesses` | `id` (uuid), `owner_id`, `name`, `phone`, `email`, `logo_url`, `currency`, `allow_negative_stock`, `receipt_footer`, `created_at` | `address`, `timezone`, `updated_at` |
| `business_members` | `id`, `business_id`, `user_id` (uuid), `role`, `created_at`, `full_name` | `updated_at` |
| `business_invitations` | `id`, `business_id`, `full_name`, `email`, `role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`, `created_at` | `revoked_at`, legacy `token` |
| `products` | `id` (uuid), `business_id`, `name`, `sku`, `category`, `buying_price` (numeric), `selling_price` (numeric), `quantity` (numeric), `unit`, `low_stock_level`, `barcode`, `created_at`, `updated_at` | `image_url`, `is_archived` |
| `stores` | `id`, `business_id`, `name`, `created_at` | — |
| `profiles` | `id`, `full_name`, `created_at` | `email` |

The inventory's original warning about `products.quantity` being possibly `integer` is resolved: it is `numeric`. The warning about `business_invitations.token_hash` is resolved: the column exists and no `token` column was found.

## 2. Live objects verified absent

Each returned `PGRST205: Could not find the table 'public.<name>' in the schema cache`.

`suppliers`, `purchases`, `purchase_items`, `supplier_payments`, `customers`, `customer_payments`, `sales`, `sale_items`, `expenses`, `stock_movements`, `audit_logs`, `demo_businesses`, `demo_accounts`, `demo_reset_logs`.

## 3. Functions not exposed with the expected signatures

Probed using correct argument names with invalid values so PostgREST rejected the call before execution. All returned `PGRST202` with the exact expected signature in the message.

`is_business_member`, `is_business_owner`, `create_business`, `app_is_business_member`, `app_has_business_role`, `complete_sale`, `cancel_sale`, `adjust_stock`, `record_purchase`, `record_supplier_payment`, `record_customer_payment`, `list_business_invitations`, `revoke_business_invitation`, `update_member_role`, `remove_member`, `demo_current_status`.

Alternative argument names (`business_id`, `p_business`, `b_id`, `id`) were also tried for `is_business_member` and `is_business_owner`; none matched. These functions may exist under signatures not used by the app, which only a catalog query can confirm. `accept_business_invitation` was not invoked because it is mutating.

## 4. Migration files and status

| File | Intended effect | Live status |
| --- | --- | --- |
| `20261124000100_core_schema.sql` | Additive columns plus 11 new tables, sequences, indexes | **Not applied** |
| `20261124000200_functions.sql` | Membership helpers, onboarding, POS/purchase/stock/customer/team RPCs | **Not applied** (except pre-existing `get_my_workspace()` outside this file) |
| `20261124000300_new_tables_rls.sql` | RLS and policies for new tables | **Not applied** |
| `20261125000100_demo_system.sql` | Demo registry, status/reset/seed functions, grants | **Not applied** |
| `manual_review_existing_tables_rls.sql` | Review-only, not auto-applied | Not executed |
| `manual_demo_security_review.sql` | Read-only catalog queries | Not executed |

## 5. Required catalog verification before approval

Because the anon key cannot read catalog metadata, an administrator with SQL editor access must run read-only catalog queries to confirm:

1. All existing RLS policies on the six live tables, especially `products`, `stores`, `businesses`, `business_members` and `business_invitations`. Permissive policies OR together; new restrictive policies do not narrow them.
2. Unique constraint on `business_members (business_id, user_id)`.
3. Ownership and `SECURITY DEFINER` flags of existing functions, `search_path` settings, and `EXECUTE` grants.
4. Triggers `add_business_owner()` and `handle_new_user()` and whether they create businesses/memberships.
5. Grants to `anon` and `authenticated`, especially write privileges and `TRUNCATE`.
6. Whether `accept_business_invitation` exists and its exact signature.

See `docs/MIGRATION_PHASE2_PLAN.md` for the proposed approval package.
