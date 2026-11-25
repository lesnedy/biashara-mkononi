# Demo Account System — Biashara Mkononi

Status: **code and migrations prepared; NOT provisioned**. No database migration
or account creation has been executed against the live Supabase project. An
administrator must review and approve every manual step below.

---

## 1. Purpose and architecture

The demo system lets a visitor sign in as one of five predefined roles and see
the real application with realistic sample data. It is **additive**: normal
registration, real users and real businesses (including `SALI COMPANY`) are not
modified by any part of this implementation.

```
Browser
  ├─ / (login)          → role cards fill the normal Supabase sign-in form
  ├─ AppShell           → demo badge + banner + link to /settings/demo
  └─ /settings/demo     → owner-only reset UI (typed "RESET" confirmation)
        │
        ▼
Route Handlers (server only)
  ├─ GET /api/demo/status → demo_current_status() RPC via user session
  └─ POST /api/demo/reset → rate limit → reset_demo_business() RPC
        │
        ▼
Supabase Postgres
  ├─ demo_businesses / demo_accounts / demo_reset_logs (strict RLS)
  ├─ demo_current_status(), reset_demo_business(), demo_seed_business()
  └─ all sample rows scoped to one registered demo business_id

Manual CLI (never imported by the app)
  └─ scripts/provision-demo.mjs → SUPABASE_SERVICE_ROLE_KEY → auth.users + registry + seed
```

The service-role key is **server-side only**. It is read from
`SUPABASE_SERVICE_ROLE_KEY` (never a `NEXT_PUBLIC_` variable) and is only used
by `scripts/provision-demo.mjs`. The running web app does not use it at all.

---

## 2. Demo accounts

Shared, public credentials (intentionally visible in
`src/lib/demo/config.ts` so the cards can prefill the login form):

| Role | Email | Password |
|---|---|---|
| owner | `owner@gmail.com` | `owner@123` |
| admin | `admin@gmail.com` | `admin@123` |
| manager | `manager@gmail.com` | `manager@123` |
| cashier | `cashier@gmail.com` | `cashier@123` |
| storekeeper | `storekeeper@gmail.com` | `storekeeper@123` |

**These are not production credentials.** They are shared by all visitors; two
visitors signed in as the same role see and change the same data. Do not enter
real customer, supplier or financial information while using them.

Dedicated business:

- Name: `BIASHARA MKONONI DEMO`
- Fixed ID: `11111111-1111-4111-8111-000000000001`
- Registry label: `shared`
- Owner: the demo `owner` account (`owner_id` and an `owner` membership row)
- The other four accounts have `business_members` rows with their matching roles

Auth users are created with `email_confirm: true` and metadata
`{ demo: true, demo_role: <role> }`. **No `business_name` / `businessName`
metadata is sent**, so the existing `handle_new_user()` signup behaviour is not
emulated or changed.

---

## 3. Permission matrix

`src/lib/permissions.ts` is the single client-side map. The reset permission is
new and is owner-only:

| Capability | owner | admin | manager | cashier | storekeeper |
|---|:--:|:--:|:--:|:--:|:--:|
| dashboard, reports view | ✓ | ✓ | ✓ | — | — |
| sales use / history / discount / cancel | ✓ | ✓ | ✓ | ✓ (use/history only) | — |
| products & inventory view/manage | ✓ | ✓ | ✓ | — | ✓ |
| purchases view/manage | ✓ | ✓ | ✓ | — | ✓ |
| expenses view/manage | ✓ | ✓ | ✓ | — | — |
| customers view/manage | ✓ | ✓ | ✓ | ✓ | — |
| team view/manage | ✓ | ✓ | — | — | — |
| settings.manage | ✓ | — | — | — | — |
| **demo.reset** | **✓** | — | — | — | — |

Server-side enforcement does **not** trust this map:

1. `POST /api/demo/reset` requires a valid Supabase session and calls
   `reset_demo_business()`; the RPC derives the business and role from
   `auth.uid()` and the `demo_accounts` registry. No client-supplied business ID
   is accepted.
2. RLS on the three new tables allows `SELECT` only to members of that demo
   business, via security-definer helpers.
3. `GET /api/demo/status` only reports membership-derived state.

---

## 4. Environment variables

Copy `.env.example` to `.env.local` and fill in the values you already use:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...   # anon/publishable key (browser-safe)
SUPABASE_SERVICE_ROLE_KEY=...              # SERVER ONLY — needed only for provisioning
```

- Never commit `.env.local` or the service-role key.
- Never rename the service-role key to `NEXT_PUBLIC_*`.
- `SUPABASE_SERVICE_ROLE_KEY` is not required to run the web app; without it the
  login page shows a setup-pending notice and provisioning/refill is disabled.
- In Vercel/other hosts, add it as a server-only environment variable if you
  intend to run the provisioning script from that environment. Prefer running
  the script locally against the production project only with explicit approval.

---

## 5. Migrations and manual approval order

Files (none have been executed):

1. `supabase/migrations/20261124000100_core_schema.sql` — operational tables
   and additive columns (prerequisite for complete demo data).
2. `supabase/migrations/20261124000200_functions.sql` — POS/purchase/stock RPCs.
3. `supabase/migrations/20261124000300_new_tables_rls.sql` — RLS for new tables.
4. `supabase/migrations/20261125000100_demo_system.sql` — **new**: demo registry,
   status/reset/seed functions, RLS, grants hardening.
5. `supabase/migrations/manual_review_existing_tables_rls.sql` — existing file,
   still requires review.
6. `supabase/migrations/manual_demo_security_review.sql` — **new**: read-only
   catalog queries and commented optional hardening. Review before enabling.

The current live project only exposes the original six tables and
`get_my_workspace()`; the earlier migrations are **not applied**. Read
`docs/SCHEMA_INVENTORY.md` and run the catalog queries before approving.

Manual approval checklist:

- [ ] Confirm the target Supabase project is the intended one.
- [ ] Review the demo migration line by line, especially every `DELETE`.
- [ ] Confirm no statement can reach a business other than the registered demo
      business (every delete is `WHERE business_id = <demo id>`).
- [ ] Run `manual_demo_security_review.sql` and resolve overly broad existing
      policies/grants (permissive policies OR together; new restrictive policies
      do not narrow them).
- [ ] Apply migrations 1–4 in order using the Supabase SQL editor or your
      approved migration workflow. Do **not** apply file 5 blindly.
- [ ] Only then run the provisioning script from section 6.

---

## 6. Provisioning (manual)

```bash
# 1. inspect what would happen — no writes
node scripts/provision-demo.mjs --dry-run

# 2. after approval, provision
node scripts/provision-demo.mjs
```

The script refuses to proceed when:

- the service-role key or URL is missing;
- the demo migration has not been applied;
- any demo email already belongs to a real auth user that is not registered in
  `demo_accounts` (it will not take over an existing account);
- another business already uses the name `BIASHARA MKONONI DEMO`;
- an existing demo business or account has an unexpected owner/role/label.

It creates the five auth users, the single business, the registry rows, the five
memberships (without duplicating an owner row created by a trigger), and calls
`demo_seed_business()`. It is idempotent: re-running it reuses existing demo
users and refreshes the sample data. It never deletes auth users or real
businesses.

Verify after provisioning:

- sign in as each role and confirm `/dashboard` resolves to the demo business;
- confirm cashier cannot see products/inventory management, storekeeper cannot
  use POS, non-owners cannot see the reset control;
- confirm dashboard figures come from seeded records, not placeholder values.

---

## 7. Reset flow

1. Owner opens `/settings/demo` and types `RESET`.
2. `POST /api/demo/reset` checks the session, validates the literal confirmation
   with Zod, applies an in-process rate limit (5 attempts per 10 minutes per
   authenticated user), then calls `reset_demo_business()`.
3. The Postgres function:
   - derives business/role from `auth.uid()` (owner only, no client input);
   - takes a transaction-scoped advisory lock so concurrent resets serialise;
   - writes a `started` row to `demo_reset_logs`;
   - deletes only operational rows belonging to that registered demo business
     (child tables first);
   - re-seeds deterministic stores, products, customers, sales, purchases,
     expenses and stock movements;
   - marks the log `completed`, or `failed` with an error message. Any error is
     caught inside the subtransaction, so partial changes roll back.
4. Auth users, profiles, memberships and the demo registry are never deleted.

Rate limit caveat: the limiter is per Node process. For multi-instance
deployments, replace it with a shared store (Redis or a database table) before
exposing the demo broadly.

---

## 8. Demo data

Seed content is deterministic (fixed UUIDs) and derived from the real tables the
app reads, so dashboards, reports, POS, purchases, customers and inventory show
non-zero, internally consistent figures rather than mock constants. Relative
timestamps keep "today" and "last seven days" metrics meaningful after a reset.

Optional tables are guarded with `to_regclass()`, so the seed does not fail if
an earlier migration has not been applied — but the corresponding module will
show its existing setup warning until that migration is applied. We do not fake
unimplemented modules.

---

## 9. Security model and known limitations

- The service-role key is never bundled into the browser. Only
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
  public.
- `TRUNCATE` is revoked from `anon` and `authenticated` on all existing and new
  tables; anon write privileges are revoked. RLS alone cannot stop `TRUNCATE`.
- Existing permissive policies on `products`/`stores` must be reviewed manually;
  adding new restrictive policies does not narrow them.
- Shared accounts provide **no per-visitor isolation**. Anyone signed in as
  `owner@gmail.com` has owner access and can reset the demo. Do not connect the
  demo business to payment credentials or real customer data.
- `/forgot-password` is linked from the login page but has no route yet; do not
  present password recovery as implemented for demo accounts.
- The demo banner/status endpoints fail closed: if migration objects are
  missing, the UI reports that demo setup is unavailable rather than guessing.

---

## 10. Disabling demo mode

Code-only disable (keeps data intact):

1. Remove or hide the `<section className="demo-panel">` block in
   `src/app/page.tsx` and its `DEMO_ACCOUNTS` import.
2. Remove the banner/badge block in `src/components/app-shell.tsx`.
3. Delete `src/app/settings/demo`, `src/app/api/demo`, `src/lib/demo` and
   `src/lib/supabase/admin.ts`, then remove the `demo.reset` permission and
   demo translation keys.
4. Optionally remove the demo route from the navigation check in `src/proxy.ts`
   if you add one later.

Full removal from Supabase requires a separate, explicitly approved migration.
It must delete only rows where `business_id` is the registered demo business,
then the five demo auth users, then the three `demo_*` tables and functions.
Do not run ad-hoc deletes against the live project.

---

## 11. Production preparation

- Keep demo accounts disabled/absent in production unless you intentionally
  want a public sandbox. The login cards are visible only when this code is
  deployed; they do not create accounts by themselves.
- Confirm no `SUPABASE_SERVICE_ROLE_KEY` value appears in client bundles:
  `grep -R "service_role" .next/static` should return nothing.
- Re-run `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build`.
- Complete the manual security review from section 5, including policy edits.
- Decide whether to replace the in-process rate limiter with a shared store.
- Document that demo data may be reset by the public owner account at any time.

---

## 12. Test record (local, before live provisioning)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | passed |
| `npm run lint` | passed |
| `npm test` (8 node:test checks) | passed |
| `npm run build` (Next 16 Turbopack + Cache Components) | passed |
| Live migration / account provisioning | **not run — approval required** |
| Live RLS / auth security tests | **not run — approval and credentials required** |
