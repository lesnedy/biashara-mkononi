# Real-World Acceptance Testing — Biashara Mkononi

This document defines the mandatory acceptance gates for BIASHARA MKONONI. Passing a build or a unit test alone does **not** mean a phase is complete.

Last reconciled: 2026-11-25

## 1. Non-negotiable rules

- Never use SALI COMPANY, its owner, users, products, stores, or records for testing.
- Never use the production Supabase project for cross-user, role-escalation, isolation, destructive, or seeding tests.
- Never apply an unapproved production migration.
- Never create live authentication users, businesses, memberships, or demo data without explicit approval.
- Never expose a service-role key to browser code or client-side bundles.
- Final acceptance must run in a separate isolated Supabase test environment.
- A phase is not complete until its required acceptance gate passes and critical/high defects are fixed.

## 2. Required environment

Acceptance environment:

- Separate Supabase project with the same schema as production after approved migrations.
- Dedicated test domain/project ref and dedicated publishable key.
- Test users and businesses created only in that isolated project.
- Test data clearly labelled as synthetic.
- No connection to production storage buckets, webhooks, email domains, or analytics used by real customers.
- Reset or recreate the test environment between major scenarios so tests do not contaminate each other.
- Service-role/admin operations only in server-side scripts or SQL editor, never in browser code.

Production environment:

- Used only for read-only verification after explicit approval.
- Never used to create test accounts, test businesses, test sales, or demo records.

## 3. Per-phase acceptance gate

After each implementation phase, all applicable checks below must be performed.

### Gate A — Automated tests

- Run `npm test`.
- Run `npm run lint`.
- Run `npx tsc --noEmit --incremental false`.
- Run `npm run build`.
- Add or update tests for every bug fixed.
- Record pass/fail counts and unresolved failures.

### Gate B — Database persistence

- Verify every created/updated record exists after reload and after a fresh login.
- Verify foreign keys and business IDs are present on every business-owned record.
- Verify no write succeeds only in browser state.
- Verify failed transactions leave no partial rows.

### Gate C — Complete user workflow

- Run the workflow from login/entry through final result and reload.
- Include at least one success path, one validation-failure path, and one recovery path.
- Verify success messages only appear after database persistence.

### Gate D — Authorization and business isolation

- Test two businesses with two owners and staff in each.
- Attempt cross-business reads, updates, deletes, and RPC calls.
- Verify every attempt is denied by RLS/RPC authorization, not only by UI hiding.
- Verify each role can access only permitted features.

### Gate E — Error handling and recovery

- Simulate missing/invalid input, insufficient stock, overpayment/underpayment, duplicate submits, network failure, and unavailable RPCs.
- Verify no raw schema details are shown to users.
- Verify failed operations do not create partial financial records.
- Verify the user can retry safely after correcting the issue.

### Gate F — Financial reconciliation

For every transaction scenario, reconcile figures against underlying rows:

- Revenue = sum of completed, non-cancelled sale totals.
- Cash/mobile/bank/credit received = sum of linked payments.
- COGS = sum of sale item `unit_cost × quantity` for completed sales.
- Gross profit = revenue − COGS.
- Net profit = gross profit − operating expenses.
- Inventory balance = opening stock + purchases − sales − adjustments/damage.
- Customer balance = credit sales − customer payments.
- Supplier balance = purchases − supplier payments.
- Cancelled/voided transactions are excluded or reversed consistently.

Dashboard and report figures must match these database reconciliations exactly.

### Gate G — Defect policy

Before proceeding to the next phase:

- All critical defects fixed.
- All high-priority defects fixed or explicitly escalated with written approval.
- Medium/low issues logged in `docs/PROJECT_STATUS.md` with owner and status.
- No phase marked complete while a critical acceptance test fails.

## 4. Final isolated-business acceptance scenario

Run the following in the isolated test environment using synthetic users and businesses only.

1. Register Business A and Business B, each with a distinct owner.
2. Log in as each owner; confirm workspace resolves to the correct business.
3. Create stores for Business A.
4. Create products with SKU, barcode, category, unit, buying price, selling price, low-stock threshold, and opening stock.
5. Register a supplier for Business A.
6. Create a purchase with multiple items and partial supplier payment.
7. Verify stock increased and every movement has a traceable row.
8. Record cash sales, credit sales, discounted sales, and a sale with insufficient stock.
9. Record partial and full customer payments.
10. Record operating expenses in multiple categories.
11. Create customers with credit limits and verify balances.
12. Invite Admin, Manager, Cashier, and Storekeeper employees.
13. Accept invitations and verify each role’s permissions from a fresh session.
14. Attempt cross-business access from Business B into Business A records; verify denial.
15. Attempt self-role-change and unauthorized financial access; verify denial.
16. Verify low-stock and out-of-stock alerts.
17. Generate daily, weekly, monthly, product, expense, purchase, customer-debt, supplier-debt, stock-movement, and payment-method reports.
18. Reconcile revenue, cash received, credit sales, receivables, COGS, gross profit, expenses, net profit, inventory valuation, customer balances, and supplier balances against database rows.
19. Log out, log back in as each role, and reload every major page.
20. Verify all records persist and no unauthorized data appears.
21. Repeat a sale submit and a customer payment submit with the same idempotency key; verify no duplicate rows or double deductions.
22. Verify raw database errors are never shown to users.

## 5. Evidence required at final delivery

For every acceptance scenario, record:

- Date, environment/project ref, and build commit/version.
- Automated test output with pass/fail counts.
- Workflow steps executed and observed result.
- SQL reconciliation queries and their result values.
- Screenshots or exported reports for dashboard and report figures.
- Authorization test attempts and denial evidence.
- Failed tests, unresolved defects, severity, and status.
- Explicit statement of what was **not** tested live.

## 6. Production readiness rule

Declare the system production-ready only when:

- All critical and high acceptance tests pass in the isolated environment.
- Financial figures reconcile exactly with database transactions.
- Authorization and business isolation tests pass for every role.
- No critical workflow depends on mock data or unaudited fallbacks.
- All blocking security findings are resolved.
- Backup/recovery and deployment procedures are verified.
- Remaining limitations are documented.

If any essential live-only item is unapproved or unverified, status must remain **implemented but not production-verified**, not production-ready.

## 7. Current status

Acceptance testing: **not started**.

Blockers:

- Database migrations are not applied.
- Required RPCs and operational tables are absent from the live schema.
- Isolated Supabase test environment has not been provisioned.
- Explicit approval is required before any live account, business, membership, demo record, migration, or isolation test is created/executed.
