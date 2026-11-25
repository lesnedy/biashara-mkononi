-- =====================================================================
-- BIASHARA MKONONI - COMPLETE OPERATIONAL SCHEMA
-- File: supabase/migrations/drafts/01_core_schema.draft.sql
-- Status: DRAFT. Not applied. Additive only: no DROP, TRUNCATE, or row update.
--
-- This draft replaces the older 20261124000100_core_schema.sql for approval.
-- It reconciles the app contract, the live column inventory and the catalog
-- verification findings. It does not seed data and never references SALI
-- COMPANY or any real business record.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Additive columns on pre-existing tables
-- ---------------------------------------------------------------------

alter table if exists public.businesses
  add column if not exists address text,
  add column if not exists timezone text not null default 'Africa/Dar_es_Salaam',
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.business_members
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.business_invitations
  add column if not exists revoked_at timestamptz;

alter table if exists public.stores
  add column if not exists location text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.products
  add column if not exists store_id uuid references public.stores (id) on delete set null,
  add column if not exists image_url text,
  add column if not exists is_archived boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Optional integrity indexes on existing parents. Safe because id is already
-- globally unique; these only enable future composite foreign keys.
create unique index if not exists stores_business_id_id_key
  on public.stores (business_id, id);
create unique index if not exists products_business_id_id_key
  on public.products (business_id, id);

-- ---------------------------------------------------------------------
-- 2. Sequences for human-readable references
-- ---------------------------------------------------------------------

create sequence if not exists public.sale_receipt_seq;
create sequence if not exists public.purchase_ref_seq;

-- ---------------------------------------------------------------------
-- 3. Stock movement audit trail
-- ---------------------------------------------------------------------

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  product_id uuid not null references public.products (id) on delete restrict,
  movement_type text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  quantity_before numeric(14, 3) not null,
  quantity_after numeric(14, 3) not null,
  unit_cost numeric(14, 2),
  note text,
  reference_type text,
  reference_id uuid,
  idempotency_key text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_type_check
    check (movement_type in ('in', 'out', 'adjustment', 'damage', 'transfer', 'sale', 'purchase', 'refund', 'purchase_reversal'))
);

create index if not exists stock_movements_business_idx
  on public.stock_movements (business_id, created_at desc);
create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id, created_at desc);
create unique index if not exists stock_movements_idempotency_idx
  on public.stock_movements (business_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------
-- 4. Suppliers and purchases
-- ---------------------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  location text,
  notes text,
  balance numeric(14, 2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_business_id_id_key unique (business_id, id)
);

create index if not exists suppliers_business_idx
  on public.suppliers (business_id, name);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  reference text not null,
  purchase_date date not null default current_date,
  subtotal numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  paid numeric(14, 2) not null default 0,
  status text not null default 'pending',
  note text,
  idempotency_key text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchases_status_check
    check (status in ('paid', 'partial', 'pending', 'cancelled')),
  constraint purchases_amounts_check
    check (paid >= 0 and paid <= total),
  constraint purchases_reference_key unique (business_id, reference)
);

create unique index if not exists purchases_idempotency_idx
  on public.purchases (business_id, idempotency_key)
  where idempotency_key is not null;
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
create index if not exists purchase_items_product_idx
  on public.purchase_items (product_id);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  purchase_id uuid references public.purchases (id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null default 'Cash',
  note text,
  idempotency_key text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists supplier_payments_idempotency_idx
  on public.supplier_payments (business_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists supplier_payments_business_idx
  on public.supplier_payments (business_id, created_at desc);
create index if not exists supplier_payments_purchase_idx
  on public.supplier_payments (purchase_id);

-- ---------------------------------------------------------------------
-- 5. Customers and customer payments
-- ---------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  credit_limit numeric(14, 2) not null default 0 check (credit_limit >= 0),
  balance numeric(14, 2) not null default 0 check (balance >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_business_id_id_key unique (business_id, id)
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
  idempotency_key text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists customer_payments_idempotency_idx
  on public.customer_payments (business_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists customer_payments_business_idx
  on public.customer_payments (business_id, created_at desc);
create index if not exists customer_payments_customer_idx
  on public.customer_payments (customer_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Sales and sale items
-- ---------------------------------------------------------------------

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  receipt_number text not null,
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
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint sales_status_check
    check (status in ('completed', 'cancelled', 'refunded')),
  constraint sales_amounts_check
    check (
      subtotal >= 0
      and discount >= 0
      and total >= 0
      and paid >= 0
      and change_due >= 0
    ),
  constraint sales_receipt_idx unique (business_id, receipt_number)
);

create unique index if not exists sales_idempotency_idx
  on public.sales (business_id, idempotency_key)
  where idempotency_key is not null;
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
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  line_total numeric(14, 2) not null
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_idx on public.sale_items (product_id);

-- ---------------------------------------------------------------------
-- 7. Expenses
-- ---------------------------------------------------------------------

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
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
create index if not exists expenses_store_idx
  on public.expenses (store_id, expense_date desc);

-- ---------------------------------------------------------------------
-- 8. Audit log
-- ---------------------------------------------------------------------

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
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);

-- ---------------------------------------------------------------------
-- 9. Read-only payment reconciliation view
--    There is no generic `payments` table in the app contract. Payments are
--    represented by sales.paid, customer_payments and supplier_payments.
--    This view unifies them for reconciliation without creating a new ledger
--    that could diverge from the source tables.
-- ---------------------------------------------------------------------

create or replace view public.payment_activity
with (security_invoker = true) as
select
  s.business_id,
  s.id::text as reference_id,
  s.receipt_number as reference,
  s.payment_method,
  s.paid as amount,
  s.created_at,
  'sale'::text as payment_kind
from public.sales s
where s.status = 'completed'
union all
select
  cp.business_id,
  cp.id::text as reference_id,
  coalesce(c.name, 'Customer payment') as reference,
  cp.payment_method,
  cp.amount,
  cp.created_at,
  'customer_payment'::text as payment_kind
from public.customer_payments cp
join public.customers c on c.id = cp.customer_id
union all
select
  sp.business_id,
  sp.id::text as reference_id,
  coalesce(su.name, 'Supplier payment') as reference,
  sp.payment_method,
  sp.amount,
  sp.created_at,
  'supplier_payment'::text as payment_kind
from public.supplier_payments sp
join public.suppliers su on su.id = sp.supplier_id;

commit;
