-- =====================================================================
-- BIASHARA MKONONI - MANUAL REVIEW ONLY (NOT AUTO-APPLIED)
-- File: manual_review_existing_tables_rls.sql
--
-- This file is deliberately NOT timestamp-prefixed, so `supabase db push`
-- will not run it automatically.
--
-- It contains policies for tables that ALREADY EXIST and therefore may
-- ALREADY HAVE their own policies:
--     businesses, business_members, business_invitations, products
--
-- Steps before running:
--   1. Run the inventory queries below.
--   2. Compare the existing policies with the proposed ones.
--   3. Apply only the policies that are genuinely missing.
--
-- NOTE: RLS policies for the same command are OR-combined. Adding a
-- policy can only WIDEN access, never narrow it. Review carefully.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Inventory queries (read-only, safe)
-- ---------------------------------------------------------------------

-- Tables with RLS state
-- select relname, relrowsecurity, relforcerowsecurity
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r'
-- order by relname;

-- Existing policies
-- select tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, policyname;

-- Existing functions and signatures
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
-- order by p.proname;

-- Existing triggers
-- select event_object_table, trigger_name, action_timing, event_manipulation
-- from information_schema.triggers
-- where trigger_schema = 'public'
-- order by event_object_table, trigger_name;

-- business_invitations columns
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'business_invitations'
-- order by ordinal_position;

-- business_members duplicates (must be empty before adding a unique key)
-- select business_id, user_id, count(*)
-- from public.business_members
-- group by business_id, user_id
-- having count(*) > 1;

-- ---------------------------------------------------------------------
-- 2. Proposed policies (DO NOT RUN BLINDLY)
-- ---------------------------------------------------------------------
-- Uncomment one block at a time, only if the inventory shows the policy
-- is missing.

-- products: readable by every member of the business
-- do $$
-- begin
--   create policy products_select_members on public.products
--     for select to authenticated
--     using (public.app_is_business_member(business_id));
-- exception when duplicate_object then null;
-- end $$;

-- products: only owner/admin/manager/storekeeper may create or edit
-- do $$
-- begin
--   create policy products_write_roles on public.products
--     for update to authenticated
--     using (public.app_has_business_role(
--       business_id, array['owner', 'admin', 'manager', 'storekeeper']
--     ))
--     with check (public.app_has_business_role(
--       business_id, array['owner', 'admin', 'manager', 'storekeeper']
--     ));
-- exception when duplicate_object then null;
-- end $$;

-- products: only owner/admin may delete
-- do $$
-- begin
--   create policy products_delete_roles on public.products
--     for delete to authenticated
--     using (public.app_has_business_role(business_id, array['owner', 'admin']));
-- exception when duplicate_object then null;
-- end $$;

-- business_members: employees may read colleagues in their business
-- do $$
-- begin
--   create policy business_members_read on public.business_members
--     for select to authenticated
--     using (
--       user_id = auth.uid()
--       or public.app_is_business_member(business_id)
--     );
-- exception when duplicate_object then null;
-- end $$;

-- business_members: only owner/admin may add, and never as owner
-- do $$
-- begin
--   create policy business_members_write on public.business_members
--     for insert to authenticated
--     with check (
--       role <> 'owner'
--       and public.app_has_business_role(business_id, array['owner', 'admin'])
--     );
-- exception when duplicate_object then null;
-- end $$;

-- business_invitations: owner/admin can list pending invitations
-- do $$
-- begin
--   create policy invitations_read on public.business_invitations
--     for select to authenticated
--     using (public.app_has_business_role(business_id, array['owner', 'admin']));
-- exception when duplicate_object then null;
-- end $$;

-- business_invitations: owner/admin can create invitations
-- do $$
-- begin
--   create policy invitations_insert on public.business_invitations
--     for insert to authenticated
--     with check (
--       role <> 'owner'
--       and invited_by = auth.uid()
--       and public.app_has_business_role(business_id, array['owner', 'admin'])
--     );
-- exception when duplicate_object then null;
-- end $$;

-- business_invitations: owner/admin can revoke (delete) invitations
-- do $$
-- begin
--   create policy invitations_delete on public.business_invitations
--     for delete to authenticated
--     using (public.app_has_business_role(business_id, array['owner', 'admin']));
-- exception when duplicate_object then null;
-- end $$;
