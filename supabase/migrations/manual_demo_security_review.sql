-- =====================================================================
-- BIASHARA MKONONI - DEMO SECURITY REVIEW (READ ONLY)
-- File: supabase/migrations/manual_demo_security_review.sql
--
-- This file contains ONLY diagnostic queries. It is NOT auto-applied.
-- Run it in the Supabase SQL editor, read the results, and then decide
-- whether the commented-out statements are appropriate for YOUR project.
--
-- It never mentions SALI COMPANY by ID and never modifies real data.
-- =====================================================================

-- 1. Which tables are exposed to anon / authenticated, and with which privileges?
select
  t.tablename,
  array_agg(
    p.privilege_type order by p.privilege_type
  ) filter (where p.grantee = 'anon') as anon_privileges,
  array_agg(
    p.privilege_type order by p.privilege_type
  ) filter (where p.grantee = 'authenticated') as authenticated_privileges
from pg_tables t
left join information_schema.role_table_grants p
  on p.table_schema = t.schemaname
 and p.table_name = t.tablename
where t.schemaname = 'public'
group by t.tablename
order by t.tablename;

-- 2. What RLS policies exist today, and are they permissive?
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  permissive,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Is RLS actually enabled / forced?
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 4. Find overly broad write policies (no business scoping).
--    Policies shown here should be reviewed before the demo is enabled.
select
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and cmd in ('INSERT', 'UPDATE', 'DELETE')
  and (with_check is null or with_check not ilike '%business_id%')
order by tablename;

-- 5. Demo objects created by 20261125000100_demo_system.sql.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('demo_businesses', 'demo_accounts', 'demo_reset_logs')
order by table_name;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'demo_is_member', 'demo_is_owner', 'demo_current_status',
    'demo_seed_business', 'reset_demo_business'
  )
order by routine_name;

-- ---------------------------------------------------------------------
-- OPTIONAL HARDENING — uncomment only after reviewing the results above.
-- These statements remove privileges, not data. They can be re-granted.
-- ---------------------------------------------------------------------

-- revoke insert, update, delete, truncate on public.products from anon;
-- revoke insert, update, delete, truncate on public.stores from anon;
-- revoke truncate on public.products, public.stores from authenticated;
-- revoke all on all tables in schema public from anon;
-- grant usage on schema public to anon, authenticated;

-- WARNING: permissive RLS policies OR together. Adding a new restrictive
-- policy does NOT narrow existing access. If query 4 returns broad policies
-- on products/stores, they must be edited or dropped explicitly, one at a
-- time, after confirming the application still works. Do not do this during
-- the initial demo rollout.

-- ---------------------------------------------------------------------
-- 5. PUBLIC privilege revocation proposal (DOCUMENTATION ONLY — NOT RUN)
-- ---------------------------------------------------------------------
-- The demo migration revokes INSERT/UPDATE/DELETE/TRUNCATE from anon and
-- revokes TRUNCATE from authenticated. It does not revoke privileges held by
-- the generic PUBLIC role. Privileges granted to PUBLIC are inherited by anon
-- and authenticated, so a future grant to PUBLIC could re-open writes even
-- after the demo-specific revocations.
--
-- Proposed, reviewed, NOT EXECUTED statement:
--
--   do $$
--   declare target_table text;
--   begin
--     foreach target_table in array array[
--       'profiles', 'businesses', 'business_members', 'stores', 'products',
--       'business_invitations', 'sales', 'sale_items', 'customers',
--       'customer_payments', 'suppliers', 'purchases', 'purchase_items',
--       'supplier_payments', 'expenses', 'stock_movements', 'audit_logs',
--       'demo_businesses', 'demo_accounts', 'demo_reset_logs'
--     ] loop
--       if to_regclass('public.' || target_table) is not null then
--         execute format(
--           'revoke insert, update, delete, truncate on public.%I from public',
--           target_table
--         );
--       end if;
--     end loop;
--   end $$;
--
-- Effects:
--   * Removes INSERT/UPDATE/DELETE/TRUNCATE inherited through PUBLIC on the
--     listed tables. It does not remove SELECT and does not delete data.
--   * service_role/table owners remain unaffected; Postgres superuser/owner
--     authority is not a PUBLIC grant.
--   * It is safe only if the application never relies on PUBLIC write grants.
--     The SSR app signs in as authenticated and uses named roles, but live
--     grants must be inspected with query 1 before approval.
--   * It must be included in the private-demo migration only after that live
--     grant review; it must not be run ad hoc during this review.
