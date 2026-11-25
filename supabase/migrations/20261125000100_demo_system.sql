-- =====================================================================
-- BIASHARA MKONONI - DEMO ACCOUNT SYSTEM (ADDITIVE)
-- Migration: 20261125000100_demo_system.sql
-- Project:   ixjlbrzwrzruiuqnvllu
--
-- STATUS: REVIEW REQUIRED. This file has NOT been executed against the live
-- project. An administrator must review and approve it before running it.
--
-- SAFETY:
--   * No DROP TABLE / TRUNCATE / real-business DELETE.
--   * No auth user is created or modified by this migration.
--   * Existing functions (handle_new_user, add_business_owner,
--     create_business, get_my_workspace, invitation RPCs) are not replaced.
--   * All deletes inside reset_demo_business() are scoped to a business that
--     is registered in public.demo_businesses and verified as demo-owned.
--   * Seed inserts use fixed UUIDs so they are idempotent.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Demo registry tables
-- ---------------------------------------------------------------------

create table if not exists public.demo_businesses (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  label text not null default 'shared',
  display_name text not null,
  currency text not null default 'TZS',
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists demo_businesses_label_key
  on public.demo_businesses (label);

create table if not exists public.demo_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.demo_businesses (business_id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null unique,
  role text not null check (
    role in ('owner', 'admin', 'manager', 'cashier', 'storekeeper')
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_accounts_business_idx
  on public.demo_accounts (business_id);

create table if not exists public.demo_reset_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.demo_businesses (business_id) on delete cascade,
  initiated_by uuid references auth.users (id) on delete set null,
  status text not null check (status in ('started', 'completed', 'failed')),
  error_details text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists demo_reset_logs_business_idx
  on public.demo_reset_logs (business_id, started_at desc);

-- ---------------------------------------------------------------------
-- 2. Demo membership helpers (new names; never overwrite existing helpers)
-- ---------------------------------------------------------------------

create or replace function public.demo_is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.demo_is_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.demo_businesses d
    join public.business_members m
      on m.business_id = d.business_id
    where d.business_id = p_business_id
      and d.is_active
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

revoke all on function public.demo_is_member(uuid) from public, anon;
revoke all on function public.demo_is_owner(uuid) from public, anon;
grant execute on function public.demo_is_member(uuid) to authenticated;
grant execute on function public.demo_is_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Secure status RPC
-- ---------------------------------------------------------------------

create or replace function public.demo_current_status()
returns table (
  is_demo boolean,
  business_id uuid,
  business_name text,
  role text,
  can_reset boolean,
  last_reset_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_business uuid;
  v_business_name text;
  v_role text;
  v_can_reset boolean := false;
  v_last_reset timestamptz;
begin
  if v_uid is null then
    return query
      select false, null::uuid, null::text, null::text, false, null::timestamptz;
    return;
  end if;

  select d.business_id, b.name, a.role
    into v_business, v_business_name, v_role
  from public.demo_accounts a
  join public.demo_businesses d on d.business_id = a.business_id
  join public.businesses b on b.id = d.business_id
  where a.user_id = v_uid
    and a.is_active
    and d.is_active
  limit 1;

  if not found then
    return query
      select false, null::uuid, null::text, null::text, false, null::timestamptz;
    return;
  end if;

  v_can_reset := public.demo_is_owner(v_business)
    and exists (
      select 1
      from public.demo_accounts a
      where a.user_id = v_uid
        and a.business_id = v_business
        and a.role = 'owner'
        and a.is_active
    );

  select max(l.completed_at)
    into v_last_reset
  from public.demo_reset_logs l
  where l.business_id = v_business
    and l.status = 'completed';

  return query
    select true, v_business, v_business_name, v_role, v_can_reset, v_last_reset;
end;
$$;

revoke all on function public.demo_current_status() from public, anon;
grant execute on function public.demo_current_status() to authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS for demo tables
-- ---------------------------------------------------------------------

alter table public.demo_businesses enable row level security;
alter table public.demo_accounts enable row level security;
alter table public.demo_reset_logs enable row level security;

-- FORCE ROW LEVEL SECURITY is intentionally NOT used: the security-definer
-- functions below must be able to write reset logs as the function owner.

do $$
begin
  create policy demo_businesses_select on public.demo_businesses
    for select to authenticated
    using (public.demo_is_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy demo_accounts_select on public.demo_accounts
    for select to authenticated
    using (public.demo_is_member(business_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy demo_reset_logs_select on public.demo_reset_logs
    for select to authenticated
    using (public.demo_is_member(business_id));
exception when duplicate_object then null;
end $$;

revoke all on public.demo_businesses, public.demo_accounts, public.demo_reset_logs
  from public, anon, authenticated;
grant select on public.demo_businesses, public.demo_accounts, public.demo_reset_logs
  to authenticated;

-- ---------------------------------------------------------------------
-- 5. Deterministic demo seed
--    Called by the provisioning script with the service role, and by the
--    reset RPC. Optional tables are handled with dynamic SQL so this
--    migration is safe even before 20261124000100_core_schema.sql is applied.
-- ---------------------------------------------------------------------

create or replace function public.demo_seed_business(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.demo_businesses where business_id = p_business_id
  ) then
    raise exception 'NOT_A_DEMO_BUSINESS' using errcode = '42501';
  end if;

  -- Always-present tables: delete products before stores so a product-to-store
  -- foreign key cannot block the store delete. Inserts still create stores first.
  delete from public.products where business_id = p_business_id;
  delete from public.stores where business_id = p_business_id;

  insert into public.stores (id, business_id, name, location)
  values
    ('22222222-2222-4222-8222-000000000001'::uuid, p_business_id, 'Duka Kuu', 'Dar es Salaam'),
    ('22222222-2222-4222-8222-000000000002'::uuid, p_business_id, 'Tawi la Sokoni', 'Kariakoo, Dar es Salaam');

  insert into public.products (
    id, business_id, store_id, name, sku, category,
    buying_price, selling_price, quantity, low_stock_level, unit,
    created_at, updated_at
  )
  values
    ('33333333-3333-4333-8333-000000000001'::uuid, p_business_id, '22222222-2222-4222-8222-000000000001'::uuid, 'Sukari 1kg', 'SUK-1KG', 'Vyakula', 2800, 3500, 120, 20, 'kg', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000002'::uuid, p_business_id, '22222222-2222-4222-8222-000000000001'::uuid, 'Mchele 1kg', 'MCH-1KG', 'Vyakula', 2100, 2700, 200, 30, 'kg', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000003'::uuid, p_business_id, '22222222-2222-4222-8222-000000000001'::uuid, 'Mafuta ya kupikia 1L', 'MAF-1L', 'Vyakula', 4300, 5500, 80, 15, 'lita', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000004'::uuid, p_business_id, '22222222-2222-4222-8222-000000000001'::uuid, 'Unga wa mahindi 2kg', 'UNG-2KG', 'Vyakula', 2600, 3300, 60, 12, 'pakiti', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000005'::uuid, p_business_id, '22222222-2222-4222-8222-000000000001'::uuid, 'Sabuni ya kufulia 1kg', 'SAB-1KG', 'Usafi', 1800, 2400, 90, 15, 'kg', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000006'::uuid, p_business_id, '22222222-2222-4222-8222-000000000002'::uuid, 'Maji 1.5L', 'MAJ-15L', 'Vinywaji', 600, 900, 240, 40, 'pcs', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000007'::uuid, p_business_id, '22222222-2222-4222-8222-000000000002'::uuid, 'Soda 500ml', 'SOD-500', 'Vinywaji', 700, 1000, 180, 30, 'pcs', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000008'::uuid, p_business_id, '22222222-2222-4222-8222-000000000001'::uuid, 'Kahawa 200g', 'KAH-200', 'Vinywaji', 2300, 3000, 45, 10, 'pakiti', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000009'::uuid, p_business_id, '22222222-2222-4222-8222-000000000001'::uuid, 'Chai 100g', 'CHAI-100', 'Vinywaji', 1200, 1600, 70, 15, 'pakiti', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000010'::uuid, p_business_id, '22222222-2222-4222-8222-000000000002'::uuid, 'Losheni 250ml', 'LOS-250', 'Vipodozi', 3200, 4200, 35, 8, 'pcs', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000011'::uuid, p_business_id, '22222222-2222-4222-8222-000000000001'::uuid, 'Dawa ya kusafisha 1L', 'DAW-1L', 'Vifaa vya Nyumbani', 2500, 3300, 40, 8, 'lita', now() - interval '30 days', now()),
    ('33333333-3333-4333-8333-000000000012'::uuid, p_business_id, '22222222-2222-4222-8222-000000000002'::uuid, 'Taulo za jikoni', 'TAU-JIK', 'Vifaa vya Nyumbani', 1500, 2200, 55, 10, 'pcs', now() - interval '30 days', now());

  -- Customers and their credit balances.
  if to_regclass('public.customers') is not null then
    execute format($sql$
      delete from public.customers where business_id = %L;
      insert into public.customers (
        id, business_id, name, phone, credit_limit, balance, created_at
      ) values
        ('44444444-4444-4444-8444-000000000001'::uuid, %L::uuid, 'Amina Juma', '0712345678', 100000, 14500, now() - interval '12 days'),
        ('44444444-4444-4444-8444-000000000002'::uuid, %L::uuid, 'Joseph Mwangi', '0754123456', 80000, 3200, now() - interval '9 days'),
        ('44444444-4444-4444-8444-000000000003'::uuid, %L::uuid, 'Fatma Ally', '0768123456', 60000, 0, now() - interval '6 days'),
        ('44444444-4444-4444-8444-000000000004'::uuid, %L::uuid, 'Samuel Peter', '0733123456', 120000, 7800, now() - interval '3 days');
    $sql$, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id);
  end if;

  -- Suppliers.
  if to_regclass('public.suppliers') is not null then
    execute format($sql$
      delete from public.suppliers where business_id = %L;
      insert into public.suppliers (
        id, business_id, name, phone, location, balance, created_at
      ) values
        ('77777777-7777-4777-8777-000000000001'::uuid, %L::uuid, 'Kariakoo Wholesale', '0711111111', 'Dar es Salaam', 420000, now() - interval '20 days'),
        ('77777777-7777-4777-8777-000000000002'::uuid, %L::uuid, 'Msimbazi Distributors', '0722222222', 'Dar es Salaam', 180000, now() - interval '18 days');
    $sql$, p_business_id, p_business_id, p_business_id);
  end if;

  -- Sales headers. Dates are relative so today/7-day dashboard metrics work.
  if to_regclass('public.sales') is not null then
    execute format($sql$
      delete from public.sales where business_id = %L;
      insert into public.sales (
        id, business_id, receipt_number, customer_id, subtotal, discount,
        total, paid, change_due, payment_method, status, created_at
      ) values
        ('55555555-5555-4555-8555-000000000001'::uuid, %L::uuid, 'BM-DEMO-0001', null, 18700, 0, 18700, 18700, 0, 'Cash', 'completed', now()),
        ('55555555-5555-4555-8555-000000000002'::uuid, %L::uuid, 'BM-DEMO-0002', null, 16300, 300, 16000, 16000, 0, 'M-Pesa', 'completed', now() - interval '2 hours'),
        ('55555555-5555-4555-8555-000000000003'::uuid, %L::uuid, 'BM-DEMO-0003', '44444444-4444-4444-8444-000000000001'::uuid, 9600, 0, 9600, 0, 0, 'Cash', 'completed', now() - interval '4 hours'),
        ('55555555-5555-4555-8555-000000000004'::uuid, %L::uuid, 'BM-DEMO-0004', null, 24100, 500, 23600, 23600, 0, 'Cash', 'completed', now() - interval '1 day'),
        ('55555555-5555-4555-8555-000000000005'::uuid, %L::uuid, 'BM-DEMO-0005', '44444444-4444-4444-8444-000000000002'::uuid, 18900, 0, 18900, 5000, 0, 'Cash', 'completed', now() - interval '3 days'),
        ('55555555-5555-4555-8555-000000000006'::uuid, %L::uuid, 'BM-DEMO-0006', null, 32500, 1000, 31500, 31500, 0, 'Airtel Money', 'completed', now() - interval '5 days'),
        ('55555555-5555-4555-8555-000000000007'::uuid, %L::uuid, 'BM-DEMO-0007', null, 12800, 0, 12800, 12800, 0, 'Cash', 'completed', now() - interval '6 days');
    $sql$, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id);
  end if;

  -- Sale lines with cost snapshots for realistic profit metrics.
  if to_regclass('public.sale_items') is not null then
    execute format($sql$
      delete from public.sale_items where business_id = %L;
      insert into public.sale_items (
        id, sale_id, business_id, product_id, product_name,
        quantity, unit_price, unit_cost, line_total
      ) values
        ('66666666-6666-4666-8666-000000000001'::uuid, '55555555-5555-4555-8555-000000000001'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'Sukari 1kg', 2, 3500, 2800, 7000),
        ('66666666-6666-4666-8666-000000000002'::uuid, '55555555-5555-4555-8555-000000000001'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000002'::uuid, 'Mchele 1kg', 3, 2700, 2100, 8100),
        ('66666666-6666-4666-8666-000000000003'::uuid, '55555555-5555-4555-8555-000000000001'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000006'::uuid, 'Maji 1.5L', 4, 900, 600, 3600),
        ('66666666-6666-4666-8666-000000000004'::uuid, '55555555-5555-4555-8555-000000000002'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000003'::uuid, 'Mafuta ya kupikia 1L', 1, 5500, 4300, 5500),
        ('66666666-6666-4666-8666-000000000005'::uuid, '55555555-5555-4555-8555-000000000002'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000005'::uuid, 'Sabuni ya kufulia 1kg', 2, 2400, 1800, 4800),
        ('66666666-6666-4666-8666-000000000006'::uuid, '55555555-5555-4555-8555-000000000002'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000007'::uuid, 'Soda 500ml', 6, 1000, 700, 6000),
        ('66666666-6666-4666-8666-000000000007'::uuid, '55555555-5555-4555-8555-000000000003'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000004'::uuid, 'Unga wa mahindi 2kg', 2, 3300, 2600, 6600),
        ('66666666-6666-4666-8666-000000000008'::uuid, '55555555-5555-4555-8555-000000000003'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000008'::uuid, 'Kahawa 200g', 1, 3000, 2300, 3000),
        ('66666666-6666-4666-8666-000000000009'::uuid, '55555555-5555-4555-8555-000000000004'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'Sukari 1kg', 4, 3500, 2800, 14000),
        ('66666666-6666-4666-8666-000000000010'::uuid, '55555555-5555-4555-8555-000000000004'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000009'::uuid, 'Chai 100g', 5, 1600, 1200, 8000),
        ('66666666-6666-4666-8666-000000000011'::uuid, '55555555-5555-4555-8555-000000000004'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000006'::uuid, 'Maji 1.5L', 2, 900, 600, 1800),
        ('66666666-6666-4666-8666-000000000012'::uuid, '55555555-5555-4555-8555-000000000005'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000003'::uuid, 'Mafuta ya kupikia 1L', 2, 5500, 4300, 11000),
        ('66666666-6666-4666-8666-000000000013'::uuid, '55555555-5555-4555-8555-000000000005'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000011'::uuid, 'Dawa ya kusafisha 1L', 2, 3300, 2500, 6600),
        ('66666666-6666-4666-8666-000000000014'::uuid, '55555555-5555-4555-8555-000000000005'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000010'::uuid, 'Losheni 250ml', 1, 4200, 3200, 4200),
        ('66666666-6666-4666-8666-000000000015'::uuid, '55555555-5555-4555-8555-000000000006'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000002'::uuid, 'Mchele 1kg', 5, 2700, 2100, 13500),
        ('66666666-6666-4666-8666-000000000016'::uuid, '55555555-5555-4555-8555-000000000006'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000012'::uuid, 'Taulo za jikoni', 5, 2200, 1500, 11000),
        ('66666666-6666-4666-8666-000000000017'::uuid, '55555555-5555-4555-8555-000000000006'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000005'::uuid, 'Sabuni ya kufulia 1kg', 3, 2400, 1800, 7200),
        ('66666666-6666-4666-8666-000000000018'::uuid, '55555555-5555-4555-8555-000000000007'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000007'::uuid, 'Soda 500ml', 8, 1000, 700, 8000),
        ('66666666-6666-4666-8666-000000000019'::uuid, '55555555-5555-4555-8555-000000000007'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000009'::uuid, 'Chai 100g', 3, 1600, 1200, 4800);
    $sql$, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id);
  end if;

  -- Purchases, purchase lines and supplier payments.
  if to_regclass('public.purchases') is not null then
    execute format($sql$
      delete from public.purchases where business_id = %L;
      insert into public.purchases (
        id, business_id, supplier_id, reference, purchase_date,
        total, paid, status, created_at
      ) values
        ('88888888-8888-4888-8888-000000000001'::uuid, %L::uuid, '77777777-7777-4777-8777-000000000001'::uuid, 'BM-PUR-0001', current_date - 8, 240000, 240000, 'paid', now() - interval '8 days'),
        ('88888888-8888-4888-8888-000000000002'::uuid, %L::uuid, '77777777-7777-4777-8777-000000000002'::uuid, 'BM-PUR-0002', current_date - 4, 360000, 180000, 'partial', now() - interval '4 days'),
        ('88888888-8888-4888-8888-000000000003'::uuid, %L::uuid, '77777777-7777-4777-8777-000000000001'::uuid, 'BM-PUR-0003', current_date - 1, 180000, 0, 'pending', now() - interval '1 day');
    $sql$, p_business_id, p_business_id, p_business_id, p_business_id);
  end if;

  if to_regclass('public.purchase_items') is not null then
    execute format($sql$
      delete from public.purchase_items where business_id = %L;
      insert into public.purchase_items (
        id, purchase_id, business_id, product_id, description,
        quantity, unit_price, line_total
      ) values
        ('99999999-9999-4999-8999-000000000001'::uuid, '88888888-8888-4888-8888-000000000001'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'Sukari 1kg', 50, 2800, 140000),
        ('99999999-9999-4999-8999-000000000002'::uuid, '88888888-8888-4888-8888-000000000001'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000002'::uuid, 'Mchele 1kg', 50, 2000, 100000),
        ('99999999-9999-4999-8999-000000000003'::uuid, '88888888-8888-4888-8888-000000000002'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000003'::uuid, 'Mafuta ya kupikia 1L', 60, 4000, 240000),
        ('99999999-9999-4999-8999-000000000004'::uuid, '88888888-8888-4888-8888-000000000003'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000005'::uuid, 'Sabuni ya kufulia 1kg', 100, 1800, 180000);
    $sql$, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id);
  end if;

  if to_regclass('public.supplier_payments') is not null then
    execute format($sql$
      delete from public.supplier_payments where business_id = %L;
      insert into public.supplier_payments (
        id, business_id, supplier_id, purchase_id, amount, payment_method, created_at
      ) values
        ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001'::uuid, %L::uuid, '77777777-7777-4777-8777-000000000002'::uuid, '88888888-8888-4888-8888-000000000002'::uuid, 180000, 'Cash', now() - interval '4 days');
    $sql$, p_business_id, p_business_id);
  end if;

  if to_regclass('public.customer_payments') is not null then
    execute format($sql$
      delete from public.customer_payments where business_id = %L;
      insert into public.customer_payments (
        id, business_id, customer_id, amount, payment_method, created_at
      ) values
        ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001'::uuid, %L::uuid, '44444444-4444-4444-8444-000000000001'::uuid, 5000, 'M-Pesa', now() - interval '2 days');
    $sql$, p_business_id, p_business_id);
  end if;

  -- Expenses.
  if to_regclass('public.expenses') is not null then
    execute format($sql$
      delete from public.expenses where business_id = %L;
      insert into public.expenses (
        id, business_id, title, category, amount, expense_date,
        payment_method, created_at
      ) values
        ('cccccccc-cccc-4ccc-8ccc-000000000001'::uuid, %L::uuid, 'Kodi ya fremu', 'Kodi ya Fremu', 250000, current_date, 'Bank', now()),
        ('cccccccc-cccc-4ccc-8ccc-000000000002'::uuid, %L::uuid, 'Umeme', 'Umeme', 85000, current_date, 'Cash', now()),
        ('cccccccc-cccc-4ccc-8ccc-000000000003'::uuid, %L::uuid, 'Mishahara ya wafanyakazi', 'Mishahara', 400000, current_date - 2, 'Bank', now() - interval '2 days'),
        ('cccccccc-cccc-4ccc-8ccc-000000000004'::uuid, %L::uuid, 'Usafiri wa bidhaa', 'Usafiri', 35000, current_date - 5, 'Cash', now() - interval '5 days');
    $sql$, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id);
  end if;

  -- Stock movement history.
  if to_regclass('public.stock_movements') is not null then
    execute format($sql$
      delete from public.stock_movements where business_id = %L;
      insert into public.stock_movements (
        id, business_id, product_id, movement_type, quantity,
        quantity_before, quantity_after, unit_cost, note, created_at
      ) values
        ('dddddddd-dddd-4ddd-8ddd-000000000001'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'purchase', 50, 70, 120, 2800, 'Kuongeza stoo kutoka Kariakoo Wholesale', now() - interval '8 days'),
        ('dddddddd-dddd-4ddd-8ddd-000000000002'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000002'::uuid, 'purchase', 50, 150, 200, 2000, 'Kuongeza stoo', now() - interval '8 days'),
        ('dddddddd-dddd-4ddd-8ddd-000000000003'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'sale', 2, 122, 120, 2800, 'Mauzo BM-DEMO-0001', now()),
        ('dddddddd-dddd-4ddd-8ddd-000000000004'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000002'::uuid, 'sale', 3, 203, 200, 2100, 'Mauzo BM-DEMO-0001', now()),
        ('dddddddd-dddd-4ddd-8ddd-000000000005'::uuid, %L::uuid, '33333333-3333-4333-8333-000000000003'::uuid, 'damage', 3, 83, 80, 4300, 'Mafuta yaliyovuja', now() - interval '2 days');
    $sql$, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id, p_business_id);
  end if;

  if to_regclass('public.audit_logs') is not null then
    execute format($sql$
      insert into public.audit_logs (business_id, action, entity, details, created_at)
      values (%L::uuid, 'demo.seeded', 'demo_businesses', '{"source":"demo_seed_business"}'::jsonb, now());
    $sql$, p_business_id);
  end if;
end;
$$;

revoke all on function public.demo_seed_business(uuid) from public, anon, authenticated;
grant execute on function public.demo_seed_business(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6. Owner-only transactional reset
-- ---------------------------------------------------------------------

create or replace function public.reset_demo_business()
returns table (status text, message text, business_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_business uuid;
  v_log_id uuid;
  v_error text;
begin
  if v_uid is null then
    return query select 'error', 'NOT_AUTHENTICATED', null::uuid;
    return;
  end if;

  select a.business_id
    into v_business
  from public.demo_accounts a
  join public.demo_businesses d on d.business_id = a.business_id
  where a.user_id = v_uid
    and a.is_active
    and d.is_active
  limit 1;

  if v_business is null or not public.demo_is_owner(v_business) then
    return query select 'error', 'NOT_ALLOWED', null::uuid;
    return;
  end if;

  -- Serialise concurrent resets for the same demo business.
  perform pg_advisory_xact_lock(hashtextextended(v_business::text, 0));

  insert into public.demo_reset_logs (business_id, initiated_by, status, started_at)
  values (v_business, v_uid, 'started', now())
  returning id into v_log_id;

  begin
    -- Child tables first; every statement is scoped to the registered demo business.
    if to_regclass('public.sale_items') is not null then
      execute format('delete from public.sale_items where business_id = %L', v_business);
    end if;
    if to_regclass('public.customer_payments') is not null then
      execute format('delete from public.customer_payments where business_id = %L', v_business);
    end if;
    if to_regclass('public.sales') is not null then
      execute format('delete from public.sales where business_id = %L', v_business);
    end if;
    if to_regclass('public.purchase_items') is not null then
      execute format('delete from public.purchase_items where business_id = %L', v_business);
    end if;
    if to_regclass('public.supplier_payments') is not null then
      execute format('delete from public.supplier_payments where business_id = %L', v_business);
    end if;
    if to_regclass('public.purchases') is not null then
      execute format('delete from public.purchases where business_id = %L', v_business);
    end if;
    if to_regclass('public.stock_movements') is not null then
      execute format('delete from public.stock_movements where business_id = %L', v_business);
    end if;
    if to_regclass('public.expenses') is not null then
      execute format('delete from public.expenses where business_id = %L', v_business);
    end if;
    if to_regclass('public.customers') is not null then
      execute format('delete from public.customers where business_id = %L', v_business);
    end if;
    if to_regclass('public.suppliers') is not null then
      execute format('delete from public.suppliers where business_id = %L', v_business);
    end if;
    if to_regclass('public.audit_logs') is not null then
      execute format('delete from public.audit_logs where business_id = %L', v_business);
    end if;

    perform public.demo_seed_business(v_business);

    update public.demo_reset_logs
    set status = 'completed', completed_at = now()
    where id = v_log_id;

    return query select 'ok', 'DEMO_DATA_RESTORED', v_business;
  exception when others then
    get stacked diagnostics v_error = sqlerrm;

    update public.demo_reset_logs
    set status = 'failed', completed_at = now(), error_details = left(v_error, 1000)
    where id = v_log_id;

    return query select 'error', left(v_error, 200), v_business;
  end;
end;
$$;

revoke all on function public.reset_demo_business() from public, anon;
grant execute on function public.reset_demo_business() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Privilege hardening (reviewed against live grants before execution)
-- ---------------------------------------------------------------------

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'profiles', 'businesses', 'business_members', 'stores', 'products',
    'business_invitations', 'sales', 'sale_items', 'customers',
    'customer_payments', 'suppliers', 'purchases', 'purchase_items',
    'supplier_payments', 'expenses', 'stock_movements', 'audit_logs',
    'demo_businesses', 'demo_accounts', 'demo_reset_logs'
  ]
  loop
    if to_regclass('public.' || target_table) is not null then
      -- RLS never protects TRUNCATE, and the public app has no anon writes.
      execute format(
        'revoke insert, update, delete, truncate on public.%I from anon',
        target_table
      );
      execute format(
        'revoke truncate on public.%I from authenticated',
        target_table
      );
    end if;
  end loop;
end $$;

commit;
