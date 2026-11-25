-- =====================================================================
-- BIASHARA MKONONI - CATALOG PREFLIGHT (READ ONLY)
-- File: supabase/migrations/drafts/00_catalog_preflight.draft.sql
-- Status: DRAFT. Not applied. Contains no DDL and no row writes.
--
-- Run in the Supabase SQL editor with an administrator account.
-- Return sanitized results before approving any operational migration.
-- Never expose service-role keys or raw production row values.
-- =====================================================================

-- 1. Target functions: exact signatures, ownership, security flags, config.
select
  p.oid,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_function_arguments(p.oid) as full_args,
  pg_get_function_result(p.oid) as result_type,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.provolatile as volatility, -- i=immutable, s=stable, v=volatile
  p.proisstrict as strict,
  p.proretset as returns_set,
  coalesce(p.proconfig, array[]::text[]) as config,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_my_workspace',
    'get_business_invitation',
    'create_business',
    'is_business_member',
    'is_business_owner',
    'add_business_owner',
    'handle_new_user',
    'accept_business_invitation'
  )
order by p.proname, identity_args;

-- 2. Function EXECUTE privileges, including inherited PUBLIC grants.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  grantee.rolname as grantee,
  a.privilege_type,
  a.is_grantable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(
  coalesce(p.proacl, acldefault('f', p.proowner))
) a
join pg_roles grantee on grantee.oid = a.grantee
where n.nspname = 'public'
  and p.proname in (
    'get_my_workspace',
    'get_business_invitation',
    'create_business',
    'is_business_member',
    'is_business_owner',
    'add_business_owner',
    'handle_new_user',
    'accept_business_invitation'
  )
order by p.proname, identity_args, grantee.rolname, a.privilege_type;

-- 3. RLS state and every policy on public tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual as using_expression,
  p.with_check as with_check_expression
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p
  on p.schemaname = n.nspname
 and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname, p.policyname;

-- 4. Table privileges and owners.
select
  c.relname as table_name,
  pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity as rls_enabled,
  grantee.rolname as grantee,
  a.privilege_type,
  a.is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(
  coalesce(c.relacl, acldefault('r', c.relowner))
) a
join pg_roles grantee on grantee.oid = a.grantee
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname, grantee.rolname, a.privilege_type;

-- 5. Sequence privileges.
select
  c.relname as sequence_name,
  pg_get_userbyid(c.relowner) as owner,
  grantee.rolname as grantee,
  a.privilege_type,
  a.is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(
  coalesce(c.relacl, acldefault('S', c.relowner))
) a
join pg_roles grantee on grantee.oid = a.grantee
where n.nspname = 'public'
  and c.relkind = 'S'
order by c.relname, grantee.rolname, a.privilege_type;

-- 6. Default privileges.
select
  d.defaclrole::regrole as role,
  d.defaclnamespace::regnamespace as schema,
  d.defaclobjtype as object_type,
  d.defaclacl
from pg_default_acl d
order by 1, 2, 3;

-- 7. Triggers, including trigger function definitions.
select
  i.event_object_table as table_name,
  i.trigger_name,
  i.action_timing,
  i.event_manipulation,
  i.action_orientation,
  i.action_statement,
  t.tgenabled, -- O=enabled, D=disabled, R=replica, A=always
  pg_get_userbyid(t.tgowner) as owner,
  pg_get_function_identity_arguments(t.tgfoid) as function_args,
  pg_get_function_result(t.tgfoid) as function_result,
  pg_get_functiondef(t.tgfoid) as function_definition
from information_schema.triggers i
join pg_class c on c.relname = i.event_object_table
join pg_namespace n
  on n.oid = c.relnamespace
 and n.nspname = i.trigger_schema
join pg_trigger t
  on t.tgrelid = c.oid
 and t.tgname = i.trigger_name
where i.trigger_schema = 'public'
order by i.event_object_table, i.trigger_name;

-- 8. Constraints and indexes.
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns,
  ccu.table_name as foreign_table,
  ccu.column_name as foreign_column
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.constraint_schema = tc.constraint_schema
left join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.constraint_schema = tc.constraint_schema
where tc.table_schema = 'public'
group by
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  ccu.table_name,
  ccu.column_name
order by tc.table_name, tc.constraint_name;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 9. Duplicate membership guard. Must return 0 before the unique index draft.
select count(*) as duplicate_membership_pairs
from (
  select 1
  from public.business_members
  group by business_id, user_id
  having count(*) > 1
) duplicates;

-- 10. get_my_workspace return-column facts already inferred from PostgREST.
-- Confirm exact result_type from query 1 before using CREATE OR REPLACE.
-- Expected exposed columns:
-- business_id, business_name, role, owner_id, currency,
-- allow_negative_stock, full_name, phone, email, logo_url, receipt_footer.
