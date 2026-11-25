-- =====================================================================
-- BIASHARA MKONONI - RLS FOR NEW TABLES ONLY
-- Migration: 20261124000300_new_tables_rls.sql
-- Project:   ixjlbrzwrzruiuqnvllu
--
-- Scope:   sales, sale_items, stock_movements, suppliers, purchases,
--          purchase_items, supplier_payments, customers, expenses,
--          audit_logs
--
-- These tables are created by 20261124000100_core_schema.sql and did not
-- exist before, so no existing policy can conflict.
--
-- Policies on the pre-existing tables (businesses, business_members,
-- products, business_invitations, stores, profiles) are intentionally
-- NOT touched here. See manual_review_existing_tables_rls.sql.
--
-- SAFETY
--   * No DROP POLICY / DROP TABLE / TRUNCATE
--   * create policy is wrapped so re-running is safe
--   * all checks use app_* helpers (new, non-conflicting names)
-- =====================================================================

begin;

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.customers enable row level security;
alter table public.customer_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;

-- sales: readable by members, written only through complete_sale() ------
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

-- stock movements: audit trail, written by RPCs only -------------------
do $$
begin
  create policy stock_movements_select on public.stock_movements
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

-- suppliers ------------------------------------------------------------
do $$
begin
  create policy suppliers_select on public.suppliers
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

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

-- purchases ------------------------------------------------------------
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

-- customers ------------------------------------------------------------
do $$
begin
  create policy customers_select on public.customers
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

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

-- customer payments: readable by members --------------------------------
do $$
begin
  create policy customer_payments_select on public.customer_payments
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

-- expenses -------------------------------------------------------------
do $$
begin
  create policy expenses_select on public.expenses
    for select to authenticated
    using (public.app_is_business_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy expenses_insert on public.expenses
    for insert to authenticated
    with check (public.app_has_business_role(
      business_id, array['owner', 'admin', 'manager']
    ));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy expenses_update on public.expenses
    for update to authenticated
    using (public.app_has_business_role(business_id, array['owner', 'admin', 'manager']))
    with check (public.app_has_business_role(business_id, array['owner', 'admin', 'manager']));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy expenses_delete on public.expenses
    for delete to authenticated
    using (public.app_has_business_role(business_id, array['owner', 'admin']));
exception when duplicate_object then null;
end $$;

-- audit logs: owners and admins only -----------------------------------
do $$
begin
  create policy audit_logs_select on public.audit_logs
    for select to authenticated
    using (public.app_has_business_role(business_id, array['owner', 'admin']));
exception when duplicate_object then null;
end $$;

commit;
