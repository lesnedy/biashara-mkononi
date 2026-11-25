-- =====================================================================
-- BIASHARA MKONONI - ADDITIVE SCHEMA (NEW OBJECTS ONLY)
-- Migration: 20261124000100_core_schema.sql
-- Project:   ixjlbrzwrzruiuqnvllu
--
-- RECONCILIATION
--   The live project already contains:
--     profiles, businesses, business_members, stores, products,
--     business_invitations
--     is_business_member(), is_business_owner(),
--     get_business_invitation(), accept_business_invitation(),
--     add_business_owner(), handle_new_user()
--
--   Those objects are NOT recreated here. This file only:
--     1. adds missing columns to the existing tables (IF NOT EXISTS)
--     2. creates tables that do not exist yet
--     3. creates supporting indexes
--
-- SAFETY
--   * No DROP / TRUNCATE / DELETE
--   * No policies, no triggers (see the RLS migration files)
--   * No redefinition of existing functions
--
-- MANUAL VERIFICATION REQUIRED before running (see docs/SCHEMA_INVENTORY.md):
--   * confirm public.products.id is uuid (FKs below assume uuid)
--   * confirm business_invitations.token_hash exists and is the token column
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Additive columns on existing tables
-- ---------------------------------------------------------------------

alter table if exists public.businesses
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists logo_url text,
  add column if not exists currency text not null default 'TZS',
  add column if not exists timezone text not null default 'Africa/Dar_es_Salaam',
  add column if not exists allow_negative_stock boolean not null default false,
  add column if not exists receipt_footer text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.business_members
  add column if not exists full_name text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.business_invitations
  add column if not exists revoked_at timestamptz;

alter table if exists public.products
  add column if not exists barcode text,
  add column if not exists unit text not null default 'pcs',
  add column if not exists low_stock_level numeric(14, 3) not null default 5,
  add column if not exists image_url text,
  add column if not exists is_archived boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- 2. New tables
-- ---------------------------------------------------------------------

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  movement_type text not null,
  quantity numeric(14, 3) not null,
  quantity_before numeric(14, 3) not null,
  quantity_after numeric(14, 3) not null,
  unit_cost numeric(14, 2),
  note text,
  reference_type text,
  reference_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_type_check
    check (movement_type in ('in', 'out', 'adjustment', 'damage', 'transfer', 'sale', 'purchase', 'refund'))
);

create index if not exists stock_movements_business_idx
  on public.stock_movements (business_id, created_at desc);
create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id, created_at desc);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  location text,
  notes text,
  balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_business_idx
  on public.suppliers (business_id, name);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  reference text not null,
  purchase_date date not null default current_date,
  total numeric(14, 2) not null default 0,
  paid numeric(14, 2) not null default 0,
  status text not null default 'pending',
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchases_status_check
    check (status in ('paid', 'partial', 'pending', 'cancelled'))
);

create index if not exists purchases_business_idx
  on public.purchases (business_id, purchase_date desc);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null
);

create index if not exists purchase_items_purchase_idx
  on public.purchase_items (purchase_id);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  purchase_id uuid references public.purchases (id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null default 'Cash',
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists supplier_payments_business_idx
  on public.supplier_payments (business_id, created_at desc);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  credit_limit numeric(14, 2) not null default 0,
  balance numeric(14, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_business_idx
  on public.customers (business_id, name);

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null default 'Cash',
  note text,
  idempotency_key uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_payments_business_idx
  on public.customer_payments (business_id, created_at desc);
create index if not exists customer_payments_customer_idx
  on public.customer_payments (customer_id, created_at desc);
create unique index if not exists customer_payments_idempotency_idx
  on public.customer_payments (business_id, idempotency_key)
  where idempotency_key is not null;

create sequence if not exists public.sale_receipt_seq;
create sequence if not exists public.purchase_ref_seq;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  receipt_number text not null,
  customer_id uuid references public.customers (id) on delete set null,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  paid numeric(14, 2) not null default 0,
  change_due numeric(14, 2) not null default 0,
  payment_method text not null default 'Cash',
  status text not null default 'completed',
  served_by uuid references auth.users (id) on delete set null,
  note text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  constraint sales_status_check
    check (status in ('completed', 'cancelled', 'refunded'))
);

create unique index if not exists sales_receipt_idx
  on public.sales (business_id, receipt_number);
create index if not exists sales_business_idx
  on public.sales (business_id, created_at desc);
create index if not exists sales_served_by_idx
  on public.sales (served_by, created_at desc);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  unit_cost numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_idx on public.sale_items (product_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  category text not null default 'Mengineyo',
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  payment_method text not null default 'Cash',
  notes text,
  attachment_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists expenses_business_idx
  on public.expenses (business_id, expense_date desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_business_idx
  on public.audit_logs (business_id, created_at desc);

commit;
