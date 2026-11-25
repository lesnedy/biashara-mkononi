-- =====================================================================
-- BIASHARA MKONONI - OPTIONAL INTEGRITY CHECKS
-- File: supabase/migrations/drafts/04_optional_integrity.draft.sql
-- Status: DRAFT. Not applied. Requires separate approval.
-- =====================================================================

-- SECTION A — READ ONLY. Run in the SQL editor and return the sanitized count.
-- This must return 0 before the unique index in Section B is created.
select count(*) as duplicate_membership_pairs
from (
  select 1
  from public.business_members
  group by business_id, user_id
  having count(*) > 1
) duplicates;

-- SECTION B — DDL. Do not run unless Section A returned 0 and approval was
-- explicitly granted. The DO block fails closed if duplicates appeared later.
do $do$
declare
  v_duplicates bigint;
begin
  select count(*) into v_duplicates
  from (
    select 1
    from public.business_members
    group by business_id, user_id
    having count(*) > 1
  ) duplicates;

  if v_duplicates <> 0 then
    raise exception 'MEMBERSHIP_DUPLICATES_PRESENT:%', v_duplicates
      using errcode = '23505';
  end if;

  create unique index if not exists business_members_business_user_uidx
    on public.business_members (business_id, user_id);
end
$do$;

-- SECTION C — REFERENCE ONLY. Do not apply until existing-table policies and
-- grants have been read by an administrator. Permissive policies are OR-ed;
-- restrictive policies are AND-ed and can narrow access without dropping
-- existing objects. Example for one existing table:
--
-- create policy products_tenant_restrict on public.products
--   as restrictive
--   for all
--   to authenticated
--   using (public.app_is_business_member(business_id))
--   with check (
--     public.app_has_business_role(
--       business_id,
--       array['owner', 'admin', 'manager', 'storekeeper']
--     )
--   );
