# Architecture — Biashara Mkononi

Last reconciled: 2026-11-25. This describes the **current** implementation and the target model. It does not claim the target is live.

## 1. Runtime

- Next.js 16.4.6 App Router, React 19.3.0, TypeScript strict, Tailwind CSS 4.3.3.
- Supabase JS 2.x with SSR cookie sessions (`@supabase/ssr`).
- Browser-side Supabase client is created in `src/lib/supabase/client.ts`; server client in `src/lib/supabase/server.ts`.
- `src/proxy.ts` performs optimistic auth redirects only. It does not check roles or business membership.
- Cache Components and Partial Prefetching are enabled.

## 2. Current request/data flow

1. A protected page renders; `src/lib/workspace.ts` calls `supabase.auth.getUser()`.
2. It calls `get_my_workspace()` to resolve `business_id`, `role`, and business settings.
3. If that fails, it falls back to `businesses` filtered by `owner_id`, then to `create_business(...)`.
4. Each operational page reads/writes tables directly from the browser using `business_id` from the workspace hook.
5. Mutations that have prepared SQL use RPCs (`complete_sale`, `adjust_stock`, `record_purchase`, etc.). Where an RPC is missing, some pages fall back to direct table updates.

## 3. Multi-tenancy model

- Tenant key: `business_id` on every business-owned record.
- `business_members` maps users to businesses with a role.
- Intended server-side authorization lives in SQL helpers and `SECURITY DEFINER` functions:
  - `app_is_business_member(business_id)`
  - `app_has_business_role(business_id, roles[])`
- These helpers and every operational RPC are absent from the live schema cache. Therefore current tenant isolation depends entirely on browser-supplied filters and whatever policies already exist on the six live tables. That is not an adequate boundary.

## 4. Transaction model

Prepared RPCs are designed as atomic database transactions:

- `complete_sale`: validates membership/role, locks product rows, checks stock, uses database prices, inserts sale/sale_items/stock_movements/audit_logs, updates stock and customer balance.
- `record_purchase`: inserts purchase and lines, receives stock, creates stock movements, updates supplier balance.
- `adjust_stock`: locks product, validates role and quantity, updates stock, writes movement and audit row.
- `record_customer_payment`: locks customer, validates role, deduplicates on idempotency key, writes payment and audit row.

These functions are not live. Direct-table fallbacks bypass their transaction and audit guarantees.

## 5. Known architectural gaps

- No server-side Data Access Layer; authorization is mostly client-side.
- Dashboard and reports calculate financial metrics in the browser with capped fetches (`limit(1000)`/`limit(5000)`/`limit(8000)`), so totals are not authoritative.
- Query failures are converted to empty arrays, producing misleading zero metrics.
- No shared cache invalidation after mutations beyond page-local `refresh()`.
- No server-side receipt generation/printing service.
- No private demo isolation architecture; previous design used shared accounts and is not acceptable for the new requirement.
- No observability, structured logs, backup/recovery procedure, or deployment guide.

## 6. Target model (phased)

1. Server-side DAL that resolves the session and workspace once per request and exposes typed, business-scoped queries.
2. RLS on every business-owned table, with `SECURITY DEFINER` helpers used only where policy recursion would otherwise occur.
3. All financial mutations through audited RPCs with `auth.uid()`-derived authorization; no browser-supplied business/role decisions.
4. Server-rendered or RPC-backed dashboard/report aggregates with explicit error states.
5. Private demo identities/businesses provisioned server-side, isolated by membership and expiry, with cleanup.
6. Integration tests against a disposable Supabase project, never the production project.
