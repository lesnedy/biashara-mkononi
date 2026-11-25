-- =====================================================================
-- BIASHARA MKONONI - RLS AND PRIVILEGE HARDENING FOR NEW TABLES
-- File: supabase/migrations/drafts/03_rls_and_grants.draft.sql
-- Status: DRAFT. Not applied.
--
-- Scope is limited to tables created by 01_core_schema.draft.sql. Policies on
-- pre-existing tables (businesses, business_members, business_invitations,
-- stores, products, profiles) are intentionally NOT touched because their
-- current policies could not be read with the publishable key. Adding a
-- permissive policy there could only widen access, not narrow it.
--
-- SAFETY
--   * No DROP TABLE / TRUNCATE / DELETE of data.
--   * No DROP POLICY. Re-running is safe through duplicate_object handlers.
--   * RLS is enabled, never disabled.
--   * PUBLIC and anon privileges are revoked from all new objects.
--   * TRUNCATE is revoked from authenticated because RLS does not cover it.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Enable RLS on every new operational table
-- ---------------------------------------------------------------------

alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.customers enable row level security;
alter table public.customer_payments enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------
-- 2. Read policies: any member may read their own business records
-- ---------------------------------------------------------------------

do $$
begin
  create policy stock_movements_select on public.stock_movements
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy suppliers_select on public.suppliers
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy purchases_select on public.purchases
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy purchase_items_select on public.purchase_items
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy supplier_payments_select on public.supplier_payments
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy customers_select on public.customers
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy customer_payments_select on public.customer_payments
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy sales_select on public.sales
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy sale_items_select on public.sale_items
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy expenses_select on public.expenses
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

-- Audit history is deliberately restricted to owners and admins.
do $$
begin
  create policy audit_logs_select on public.audit_logs
    for select to authenticated
    using (public.app_has_business_role(business_id, array['owner', 'admin']));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 3. RLS-managed master data
--    These policies support the app's existing direct table mutations while
--    enforcing the same role gates in the database. Financial ledger tables
--    remain read-only to clients and are written only through audited RPCs.
-- ---------------------------------------------------------------------

-- Suppliers: Purchases page inserts directly. Owner/admin delete only.
do $$
begin
  create policy suppliers_insert on public.suppliers
    for insert to authenticated
    with check (public.app_has_business_role(
      business_id, array['owner', 'admin', 'manager', 'storekeeper']
    ));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy suppliers_update on public.suppliers
    for update to authenticated
    using (public.app_has_business_role(
      business_id, array['owner', 'admin', 'manager', 'storekeeper']
    ))
    with check (public.app_has_business_role(
      business_id, array['owner', 'admin', 'manager', 'storekeeper']
    ));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy suppliers_delete on public.suppliers
    for delete to authenticated
    using (public.app_has_business_role(business_id, array['owner', 'admin']));
exception when duplicate_object then null;
end $$;

-- Customers: Customers page inserts, updates and deletes directly.
do $$
begin
  create policy customers_insert on public.customers
    for insert to authenticated
    with check (public.app_has_business_role(
      business_id, array['owner', 'admin', 'manager', 'cashier']
    ));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy customers_update on public.customers
    for update to authenticated
    using (public.app_has_business_role(
      business_id, array['owner', 'admin', 'manager', 'cashier']
    ))
    with check (public.app_has_business_role(
      business_id, array['owner', 'admin', 'manager', 'cashier']
    ));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy customers_delete on public.customers
    for delete to authenticated
    using (public.app_has_business_role(business_id, array['owner', 'admin']));
exception when duplicate_object then null;
end $$;

-- Expenses: Expenses page inserts and deletes directly.
do $$
begin
  create policy expenses_insert on public.expenses
    for insert to authenticated
    with check (
      created_by = auth.uid()
      and public.app_has_business_role(
        business_id, array['owner', 'admin', 'manager']
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy expenses_update on public.expenses
    for update to authenticated
    using (public.app_has_business_role(
      business_id, array['owner', 'admin', 'manager']
    ))
    with check (public.app_has_business_role(
      business_id, array['owner', 'admin', 'manager']
    ));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy expenses_delete on public.expenses
    for delete to authenticated
    using (public.app_has_business_role(business_id, array['owner', 'admin']));
exception when duplicate_object then null;
end $$;

-- NOTE: purchases intentionally has NO delete policy. The current app deletes
-- directly from public.purchases, which would bypass stock and supplier-balance
-- reversal. After approval, change that call site to public.delete_purchase().
-- Until the app change is deployed, purchase deletion will fail closed.

-- ---------------------------------------------------------------------
-- 4. Table privileges
-- ---------------------------------------------------------------------

-- Ledger tables: read-only for authenticated clients.
revoke all on
  public.sales,
  public.sale_items,
  public.stock_movements,
  public.purchases,
  public.purchase_items,
  public.supplier_payments,
  public.customer_payments,
  public.audit_logs
from public, anon;

revoke truncate on
  public.sales,
  public.sale_items,
  public.stock_movements,
  public.purchases,
  public.purchase_items,
  public.supplier_payments,
  public.customer_payments,
  public.audit_logs
from authenticated;

grant select on
  public.sales,
  public.sale_items,
  public.stock_movements,
  public.purchases,
  public.purchase_items,
  public.supplier_payments,
  public.customer_payments,
  public.audit_logs
to authenticated;

-- RLS-managed master data: client mutations are allowed only through policies.
revoke all on
  public.suppliers,
  public.customers,
  public.expenses
from public, anon;

revoke truncate on
  public.suppliers,
  public.customers,
  public.expenses
from authenticated;

grant select, insert, update, delete on
  public.suppliers,
  public.customers,
  public.expenses
to authenticated;

-- Reconciliation view. security_invoker = true makes RLS on source tables apply.
revoke all on public.payment_activity from public, anon;
grant select on public.payment_activity to authenticated;

-- Sequences are used by SECURITY DEFINER functions, but explicit hardening
-- prevents anonymous access if default privileges changed.
revoke all on sequence public.sale_receipt_seq from public, anon;
revoke all on sequence public.purchase_ref_seq from public, anon;
grant usage, select on sequence public.sale_receipt_seq to authenticated;
grant usage, select on sequence public.purchase_ref_seq to authenticated;

commit;
