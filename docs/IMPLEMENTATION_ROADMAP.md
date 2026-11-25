# Implementation Roadmap — Biashara Mkononi

This roadmap is ordered by dependency. Each phase has an exit gate. Live Supabase operations require explicit approval immediately before execution and must be requested one operation at a time.

Mandatory acceptance rules: after each phase, run the applicable checks in `docs/ACCEPTANCE_TESTING.md` (automated tests, persistence, complete workflow, authorization/isolation, error recovery, financial reconciliation). Do not proceed while a critical or high-priority defect remains. Before final delivery, run the complete isolated-business acceptance scenario in a separate Supabase test environment. Never use SALI COMPANY or production records for testing.

## Phase 1 — Audit and documentation (local only)

**Status: complete.** Delivered: `PROJECT_STATUS.md`, `SCHEMA_INVENTORY.md`, `ARCHITECTURE.md`, `SECURITY_REVIEW.md`, `IMPLEMENTATION_ROADMAP.md`, `MIGRATION_PHASE2_PLAN.md`.

Exit gate: findings reconciled with live read-only evidence; no live writes performed.

## Phase 2 — Database design and approval package

**Status: prepared, awaiting approval.**

Actions:
- Resolve catalog unknowns with read-only SQL queries.
- Review and correct migration SQL, especially `get_my_workspace()` return-type compatibility, function grants, and existing-table policies.
- Present exact SQL, effects, risks, rollback, and data-protection statement for approval.

Exit gate: written approval for each migration operation.

## Phase 3 — Core business foundation

**Local preparation started:** safe error handling, fail-closed mutations, and unavailable states are implemented and verified locally. No live behavior changed.

- Fix `create_business` onboarding path.
- Add a typed server-side DAL for session/workspace resolution.
- Enforce role checks for all mutations at the database layer.
- Add profile and business settings UI.

Exit gate: registration, login, logout, password reset, workspace resolution, and membership verified on an isolated test project.

## Phase 4 — Products and inventory

- Apply additive product columns and `stock_movements`.
- Replace direct stock fallback with audited `adjust_stock`.
- Add store assignment/transfer model if required by the approved schema.
- Add movement history and low-stock alerts backed by real data.

Exit gate: stock changes are traceable and cross-business access is denied in tests.

## Phase 5 — POS and sales

- Apply `sales`, `sale_items`, `customer_payments`, and POS RPCs.
- Remove direct-table fallbacks.
- Add duplicate-submission protection and receipt generation.
- Verify atomic rollback on insufficient stock, invalid discount, and failed payment.

Exit gate: successful sale persists sale, lines, stock movements, and balances; failed sale changes nothing.

## Phase 6 — Purchases and expenses

- Apply supplier/purchase/expense tables and RPCs.
- Replace purchase deletion with a reversal workflow.
- Add supplier payments and balances.

Exit gate: purchase receipt updates stock atomically; expenses persist and reconcile.

## Phase 7 — Customers and financial management

- Apply customer tables and payment RPC.
- Add statements, credit limits, and balance reconciliation.
- Remove direct balance fallback.

Exit gate: balances equal the sum of underlying transactions; idempotent payments do not double-charge.

## Phase 8 — Dashboard and reports

- Replace client-side capped aggregates with server/RPC aggregates.
- Add explicit unavailable/error states instead of zeros.
- Add CSV/print exports and date/store filters.

Exit gate: metrics match database totals; failed queries never render as zero.

## Phase 9 — Team management

- Apply admin RPCs and invitation security review.
- Add store assignment, suspension, and activity log UI.
- Verify an employee cannot change their own role.

Exit gate: two-business and multi-role isolation tests pass.

## Phase 10 — Private demo

- Design per-visitor demo identity/business with server-side provisioning.
- Add expiry, cleanup, abuse protection, and safe reset.
- Never reuse real accounts or enable anonymous auth without approval.

Exit gate: two visitors cannot see each other's demo data; demo expiry works; production data untouched.

## Phase 11 — UI/UX and localization

- Polish responsive layouts, empty states, dialogs, accessibility.
- Audit all strings in Kiswahili and English.
- Add light/dark theme if practical.

Exit gate: no untranslated fragments; no horizontal overflow on mobile.

## Phase 12 — Quality assurance and delivery

- Add unit, validation, financial-calculation, integration, RLS, POS, inventory, dashboard, and demo-isolation tests.
- Run lint, type-check, tests, build.
- Execute the complete final acceptance scenario in a separate isolated Supabase test environment, including full financial reconciliation and role/isolation checks.
- Record evidence of passed tests, failed tests, unresolved issues, and production readiness.
- Produce deployment, backup/recovery, user guide (Kiswahili), admin guide, known limitations, and production-readiness assessment.

Exit gate: all quality gates and critical/high acceptance tests pass in the isolated environment; all remaining live-only items are explicitly labelled unverified. Production readiness cannot be claimed otherwise.

## Approval checkpoints

Live operations requiring explicit approval: applying migrations, creating/altering database objects, changing RLS/grants, creating auth users, creating businesses/memberships, provisioning demo data, changing auth config, running live isolation tests, modifying production records, configuring cleanup jobs, deploying.
