-- =====================================================================
-- BIASHARA MKONONI - NEW SECURE RPC FUNCTIONS
-- Migration: 20261124000200_functions.sql
-- Project:   ixjlbrzwrzruiuqnvllu
--
-- RECONCILIATION
--   The following functions already exist and are NOT redefined here:
--     is_business_member(), is_business_owner(),
--     get_business_invitation(), accept_business_invitation()
--
--   New helpers use the `app_` prefix so they can never clash with the
--   existing security functions or with policies that depend on them.
--
-- SAFETY
--   * CREATE OR REPLACE is used only for functions with brand-new names.
--   * No DROP / TRUNCATE / DELETE.
--   * Every business mutation validates the caller's membership and role
--     in the database, never from the browser.
--
-- MANUAL VERIFICATION REQUIRED before running: see docs/SCHEMA_INVENTORY.md
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Membership helpers (new names)
-- ---------------------------------------------------------------------

create or replace function public.app_is_business_member(p_business_id uuid)
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

create or replace function public.app_has_business_role(
  p_business_id uuid,
  p_roles text[]
)
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
      and m.role = any (p_roles)
  );
$$;

grant execute on function public.app_is_business_member(uuid) to authenticated;
grant execute on function public.app_has_business_role(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Onboarding (idempotent; compatible with handle_new_user())
-- ---------------------------------------------------------------------

create or replace function public.create_business(
  p_name text,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_business_id uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_full_name text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- Already a member of a business (owner or employee)?
  select m.business_id into v_existing
  from public.business_members m
  where m.user_id = v_uid
  order by (m.role = 'owner') desc, m.created_at asc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  -- Owner of an existing business but membership row is missing?
  select b.id into v_existing
  from public.businesses b
  where b.owner_id = v_uid
  order by b.created_at asc
  limit 1;

  if v_existing is not null then
    if not exists (
      select 1 from public.business_members
      where business_id = v_existing and user_id = v_uid
    ) then
      insert into public.business_members (business_id, user_id, role)
      values (v_existing, v_uid, 'owner');
    end if;

    return v_existing;
  end if;

  if v_name is null then
    v_name := 'Biashara Yangu';
  end if;

  select raw_user_meta_data ->> 'full_name' into v_full_name
  from auth.users where id = v_uid;

  insert into public.businesses (owner_id, name, phone)
  values (v_uid, v_name, nullif(btrim(coalesce(p_phone, '')), ''))
  returning id into v_business_id;

  -- add_business_owner() may already have inserted the owner row.
  if not exists (
    select 1 from public.business_members
    where business_id = v_business_id and user_id = v_uid
  ) then
    insert into public.business_members (business_id, user_id, role, full_name)
    values (v_business_id, v_uid, 'owner', v_full_name);
  end if;

  return v_business_id;
end;
$$;

grant execute on function public.create_business(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Workspace resolution (Owner AND employees)
-- ---------------------------------------------------------------------

create or replace function public.get_my_workspace()
returns table (
  business_id uuid,
  business_name text,
  role text,
  owner_id uuid,
  currency text,
  allow_negative_stock boolean,
  full_name text,
  phone text,
  email text,
  logo_url text,
  receipt_footer text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.name,
    m.role,
    b.owner_id,
    coalesce(b.currency, 'TZS'),
    coalesce(b.allow_negative_stock, false),
    m.full_name,
    b.phone,
    b.email,
    b.logo_url,
    b.receipt_footer
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  where m.user_id = auth.uid()
  order by (m.role = 'owner') desc, m.created_at asc;
$$;

grant execute on function public.get_my_workspace() to authenticated;

-- ---------------------------------------------------------------------
-- POS: complete a sale atomically
-- ---------------------------------------------------------------------

create or replace function public.complete_sale(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method text default 'Cash',
  p_paid numeric default 0,
  p_discount numeric default 0,
  p_customer_id uuid default null
)
returns table (
  sale_id uuid,
  receipt_number text,
  total numeric,
  change_due numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty numeric;
  v_subtotal numeric := 0;
  v_discount numeric := coalesce(p_discount, 0);
  v_total numeric := 0;
  v_paid numeric := coalesce(p_paid, 0);
  v_change numeric := 0;
  v_sale_id uuid;
  v_receipt text;
  v_allow_negative boolean := false;
  v_customer uuid := p_customer_id;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not public.app_has_business_role(
    p_business_id,
    array['owner', 'admin', 'manager', 'cashier']
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = '22023';
  end if;

  if v_discount < 0 then
    raise exception 'INVALID_DISCOUNT' using errcode = '22023';
  end if;

  select coalesce(b.allow_negative_stock, false) into v_allow_negative
  from public.businesses b where b.id = p_business_id;

  -- Validate every line first, using database prices and locked rows.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 0);

    if v_qty <= 0 then
      raise exception 'INVALID_QUANTITY' using errcode = '22023';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and business_id = p_business_id
      and is_archived = false
    for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if not v_allow_negative and v_product.quantity < v_qty then
      raise exception 'INSUFFICIENT_STOCK:%', v_product.name using errcode = 'P0001';
    end if;

    v_subtotal := v_subtotal + round(v_qty * v_product.selling_price, 2);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'EMPTY_CART' using errcode = '22023';
  end if;

  v_discount := least(v_discount, v_subtotal);
  v_total := round(v_subtotal - v_discount, 2);

  if v_customer is not null and not exists (
    select 1 from public.customers
    where id = v_customer and business_id = p_business_id
  ) then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_paid < v_total then
    if v_customer is null then
      raise exception 'INSUFFICIENT_PAYMENT' using errcode = '22023';
    end if;

    update public.customers
    set balance = balance + (v_total - v_paid)
    where id = v_customer and business_id = p_business_id;
  end if;

  v_change := greatest(0, round(v_paid - v_total, 2));

  v_receipt := 'BM-'
    || to_char(now() at time zone 'Africa/Dar_es_Salaam', 'YYMMDD')
    || '-' || lpad(nextval('public.sale_receipt_seq')::text, 4, '0');

  insert into public.sales (
    business_id, receipt_number, customer_id, subtotal, discount,
    total, paid, change_due, payment_method, status, served_by
  )
  values (
    p_business_id, v_receipt, v_customer, v_subtotal, v_discount,
    v_total, v_paid, v_change,
    coalesce(nullif(p_payment_method, ''), 'Cash'), 'completed', v_uid
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::numeric;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and business_id = p_business_id
    for update;

    insert into public.sale_items (
      sale_id, business_id, product_id, product_name,
      quantity, unit_price, unit_cost, line_total
    )
    values (
      v_sale_id, p_business_id, v_product.id, v_product.name,
      v_qty, v_product.selling_price, v_product.buying_price,
      round(v_qty * v_product.selling_price, 2)
    );

    update public.products
    set quantity = quantity - v_qty
    where id = v_product.id;

    insert into public.stock_movements (
      business_id, product_id, movement_type, quantity,
      quantity_before, quantity_after, unit_cost,
      reference_type, reference_id, created_by
    )
    values (
      p_business_id, v_product.id, 'sale', v_qty,
      v_product.quantity, v_product.quantity - v_qty, v_product.buying_price,
      'sale', v_sale_id, v_uid
    );
  end loop;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    p_business_id, v_uid, 'sale.completed', 'sales', v_sale_id,
    jsonb_build_object('receipt', v_receipt, 'total', v_total)
  );

  return query select v_sale_id, v_receipt, v_total, v_change;
end;
$$;

grant execute on function public.complete_sale(uuid, jsonb, text, numeric, numeric, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Cancel / refund a sale, restoring stock
-- ---------------------------------------------------------------------

create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;

  if not found then
    raise exception 'SALE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.app_has_business_role(v_sale.business_id, array['owner', 'admin', 'manager']) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'SALE_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id
  loop
    if v_item.product_id is not null then
      update public.products
      set quantity = quantity + v_item.quantity
      where id = v_item.product_id;

      insert into public.stock_movements (
        business_id, product_id, movement_type, quantity,
        quantity_before, quantity_after, unit_cost,
        reference_type, reference_id, created_by, note
      )
      select
        v_sale.business_id, p.id, 'refund', v_item.quantity,
        p.quantity - v_item.quantity, p.quantity, v_item.unit_cost,
        'sale', v_sale.id, v_uid, p_reason
      from public.products p where p.id = v_item.product_id;
    end if;
  end loop;

  if v_sale.customer_id is not null and v_sale.paid < v_sale.total then
    update public.customers
    set balance = greatest(0, balance - (v_sale.total - v_sale.paid))
    where id = v_sale.customer_id;
  end if;

  update public.sales
  set status = 'cancelled', cancelled_reason = p_reason
  where id = p_sale_id;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    v_sale.business_id, v_uid, 'sale.cancelled', 'sales', p_sale_id,
    jsonb_build_object('receipt', v_sale.receipt_number, 'reason', p_reason)
  );
end;
$$;

grant execute on function public.cancel_sale(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Inventory adjustments
-- ---------------------------------------------------------------------

create or replace function public.adjust_stock(
  p_business_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_product public.products%rowtype;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not public.app_has_business_role(
    p_business_id,
    array['owner', 'admin', 'manager', 'storekeeper']
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  if p_movement_type not in ('in', 'out', 'adjustment', 'damage', 'transfer') then
    raise exception 'INVALID_MOVEMENT_TYPE' using errcode = '22023';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_before := v_product.quantity;

  if p_movement_type = 'adjustment' then
    v_after := p_quantity;
    v_delta := p_quantity - v_before;
  elsif p_movement_type = 'in' then
    v_after := v_before + p_quantity;
    v_delta := p_quantity;
  else
    v_after := v_before - p_quantity;
    v_delta := -p_quantity;

    if v_after < 0 then
      raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
    end if;
  end if;

  update public.products set quantity = v_after where id = v_product.id;

  insert into public.stock_movements (
    business_id, product_id, movement_type, quantity,
    quantity_before, quantity_after, unit_cost, note, created_by
  )
  values (
    p_business_id, v_product.id, p_movement_type, abs(v_delta),
    v_before, v_after, v_product.buying_price, p_note, v_uid
  );

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    p_business_id, v_uid, 'stock.' || p_movement_type, 'products', v_product.id,
    jsonb_build_object('before', v_before, 'after', v_after, 'note', p_note)
  );

  return v_after;
end;
$$;

grant execute on function public.adjust_stock(uuid, uuid, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- Purchases and supplier payments
-- ---------------------------------------------------------------------

create or replace function public.record_purchase(
  p_business_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_paid numeric default 0,
  p_purchase_date date default current_date,
  p_note text default null
)
returns table (
  purchase_id uuid,
  reference text,
  total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_total numeric := 0;
  v_paid numeric := coalesce(p_paid, 0);
  v_purchase_id uuid;
  v_reference text;
  v_status text;
  v_qty numeric;
  v_price numeric;
  v_product_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not public.app_has_business_role(
    p_business_id,
    array['owner', 'admin', 'manager', 'storekeeper']
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_PURCHASE' using errcode = '22023';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and business_id = p_business_id
  ) then
    raise exception 'SUPPLIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 0);
    v_price := coalesce((v_item ->> 'unit_price')::numeric, 0);

    if v_qty <= 0 or v_price < 0 then
      raise exception 'INVALID_PURCHASE_ITEM' using errcode = '22023';
    end if;

    v_total := v_total + round(v_qty * v_price, 2);
  end loop;

  if v_paid < 0 or v_paid > v_total then
    raise exception 'INVALID_PAYMENT' using errcode = '22023';
  end if;

  v_status := case
    when v_paid = v_total then 'paid'
    when v_paid > 0 then 'partial'
    else 'pending'
  end;

  v_reference := 'PUR-'
    || to_char(now() at time zone 'Africa/Dar_es_Salaam', 'YYMMDD')
    || '-' || lpad(nextval('public.purchase_ref_seq')::text, 4, '0');

  insert into public.purchases (
    business_id, supplier_id, reference, purchase_date,
    total, paid, status, note, created_by
  )
  values (
    p_business_id, p_supplier_id, v_reference,
    coalesce(p_purchase_date, current_date),
    v_total, v_paid, v_status, p_note, v_uid
  )
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price')::numeric;
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;

    insert into public.purchase_items (
      purchase_id, business_id, product_id, description,
      quantity, unit_price, line_total
    )
    values (
      v_purchase_id, p_business_id, v_product_id,
      coalesce(nullif(btrim(coalesce(v_item ->> 'description', '')), ''), 'Bidhaa'),
      v_qty, v_price, round(v_qty * v_price, 2)
    );

    if v_product_id is not null then
      select * into v_product
      from public.products
      where id = v_product_id and business_id = p_business_id
      for update;

      if found then
        update public.products
        set quantity = quantity + v_qty,
            buying_price = v_price
        where id = v_product.id;

        insert into public.stock_movements (
          business_id, product_id, movement_type, quantity,
          quantity_before, quantity_after, unit_cost,
          reference_type, reference_id, created_by
        )
        values (
          p_business_id, v_product.id, 'purchase', v_qty,
          v_product.quantity, v_product.quantity + v_qty, v_price,
          'purchase', v_purchase_id, v_uid
        );
      end if;
    end if;
  end loop;

  if p_supplier_id is not null and v_total > v_paid then
    update public.suppliers
    set balance = balance + (v_total - v_paid)
    where id = p_supplier_id;
  end if;

  if v_paid > 0 then
    insert into public.supplier_payments (
      business_id, supplier_id, purchase_id, amount, payment_method, created_by
    )
    values (
      p_business_id, p_supplier_id, v_purchase_id, v_paid, 'Cash', v_uid
    );
  end if;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    p_business_id, v_uid, 'purchase.created', 'purchases', v_purchase_id,
    jsonb_build_object('reference', v_reference, 'total', v_total)
  );

  return query select v_purchase_id, v_reference, v_total;
end;
$$;

grant execute on function public.record_purchase(uuid, uuid, jsonb, numeric, date, text) to authenticated;

create or replace function public.record_supplier_payment(
  p_purchase_id uuid,
  p_amount numeric,
  p_payment_method text default 'Cash',
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_purchase public.purchases%rowtype;
  v_remaining numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id for update;

  if not found then
    raise exception 'PURCHASE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.app_has_business_role(
    v_purchase.business_id,
    array['owner', 'admin', 'manager']
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;

  v_remaining := v_purchase.total - v_purchase.paid;

  if p_amount > v_remaining then
    raise exception 'AMOUNT_EXCEEDS_BALANCE' using errcode = '22023';
  end if;

  update public.purchases
  set paid = paid + p_amount,
      status = case when paid + p_amount >= total then 'paid' else 'partial' end
  where id = p_purchase_id;

  insert into public.supplier_payments (
    business_id, supplier_id, purchase_id, amount, payment_method, note, created_by
  )
  values (
    v_purchase.business_id, v_purchase.supplier_id, p_purchase_id,
    p_amount, coalesce(nullif(p_payment_method, ''), 'Cash'), p_note, v_uid
  );

  if v_purchase.supplier_id is not null then
    update public.suppliers
    set balance = greatest(0, balance - p_amount)
    where id = v_purchase.supplier_id;
  end if;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    v_purchase.business_id, v_uid, 'purchase.payment', 'purchases', p_purchase_id,
    jsonb_build_object('amount', p_amount)
  );

  return v_remaining - p_amount;
end;
$$;

grant execute on function public.record_supplier_payment(uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Customer credit payments
-- ---------------------------------------------------------------------

create or replace function public.record_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_payment_method text default 'Cash',
  p_note text default null,
  p_idempotency_key uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_customer public.customers%rowtype;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- Lock the customer row so concurrent payments cannot overdraw the balance.
  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.app_has_business_role(
    v_customer.business_id,
    array['owner', 'admin', 'manager', 'cashier']
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;

  -- Replay of the same browser request: return the current balance without
  -- applying the payment twice.
  if p_idempotency_key is not null then
    select id into v_existing
    from public.customer_payments
    where business_id = v_customer.business_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_existing is not null then
      return v_customer.balance;
    end if;
  end if;

  if p_amount > v_customer.balance then
    raise exception 'AMOUNT_EXCEEDS_BALANCE' using errcode = '22023';
  end if;

  -- Insert first so the unique (business_id, idempotency_key) index rejects
  -- a duplicate that slipped past the check under concurrency.
  begin
    insert into public.customer_payments (
      business_id, customer_id, amount, payment_method, note,
      idempotency_key, created_by
    )
    values (
      v_customer.business_id, p_customer_id, p_amount,
      coalesce(nullif(p_payment_method, ''), 'Cash'), p_note,
      p_idempotency_key, v_uid
    );
  exception when unique_violation then
    return v_customer.balance;
  end;

  update public.customers
  set balance = greatest(0, balance - p_amount),
      updated_at = now()
  where id = p_customer_id;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    v_customer.business_id, v_uid, 'customer.payment', 'customers', p_customer_id,
    jsonb_build_object('amount', p_amount, 'idempotency_key', p_idempotency_key)
  );

  return v_customer.balance - p_amount;
end;
$$;

grant execute on function public.record_customer_payment(uuid, numeric, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Team administration (invitations + members)
-- ---------------------------------------------------------------------

create or replace function public.list_business_invitations(p_business_id uuid)
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.app_has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return query
    select i.id, i.full_name, i.email, i.role, i.expires_at,
           i.accepted_at, i.revoked_at, i.created_at
    from public.business_invitations i
    where i.business_id = p_business_id
    order by i.created_at desc;
end;
$$;

grant execute on function public.list_business_invitations(uuid) to authenticated;

create or replace function public.revoke_business_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_business uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select business_id into v_business
  from public.business_invitations
  where id = p_invitation_id;

  if v_business is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.app_has_business_role(v_business, array['owner', 'admin']) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.business_invitations
  set revoked_at = now()
  where id = p_invitation_id and accepted_at is null;
end;
$$;

grant execute on function public.revoke_business_invitation(uuid) to authenticated;

create or replace function public.update_member_role(
  p_member_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.business_members%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if p_role not in ('admin', 'manager', 'cashier', 'storekeeper') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  select * into v_member from public.business_members where id = p_member_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_member.role = 'owner' then
    raise exception 'CANNOT_CHANGE_OWNER' using errcode = '42501';
  end if;

  if v_member.user_id = v_uid then
    raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = '42501';
  end if;

  if not public.app_has_business_role(v_member.business_id, array['owner', 'admin']) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.business_members set role = p_role where id = p_member_id;
end;
$$;

grant execute on function public.update_member_role(uuid, text) to authenticated;

create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.business_members%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_member from public.business_members where id = p_member_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_member.role = 'owner' then
    raise exception 'CANNOT_REMOVE_OWNER' using errcode = '42501';
  end if;

  if v_member.user_id = v_uid then
    raise exception 'CANNOT_REMOVE_SELF' using errcode = '42501';
  end if;

  if not public.app_has_business_role(v_member.business_id, array['owner', 'admin']) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  delete from public.business_members where id = p_member_id;
end;
$$;

grant execute on function public.remove_member(uuid) to authenticated;

commit;
