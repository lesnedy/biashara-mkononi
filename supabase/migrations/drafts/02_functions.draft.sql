-- =====================================================================
-- BIASHARA MKONONI - SECURE TRANSACTIONAL RPCs
-- File: supabase/migrations/drafts/02_functions.draft.sql
-- Status: DRAFT. Not applied.
--
-- Design rules:
--   * Every function derives identity from auth.uid().
--   * Every mutation validates membership/role in the database.
--   * All functions use search_path = '' with fully qualified objects.
--   * Financial writes are atomic and audited.
--   * Idempotency keys prevent duplicate submissions.
--   * The pre-existing get_my_workspace() is NOT replaced. Its exact result
--     type must be confirmed by 00_catalog_preflight.draft.sql first.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Membership helpers (new names, no conflict with existing helpers)
-- ---------------------------------------------------------------------

create or replace function public.app_is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
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
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Onboarding: create_business
--    Created only if the exact signature is absent. If it already exists,
--    it is preserved until the catalog preflight is reviewed.
-- ---------------------------------------------------------------------

do $do$
begin
  if to_regprocedure('public.create_business(text, text)') is null then
    execute $ddl$
      create function public.create_business(
        p_name text,
        p_phone text default null
      )
      returns uuid
      language plpgsql
      security definer
      set search_path = ''
      as $fn$
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

        select m.business_id into v_existing
        from public.business_members m
        where m.user_id = v_uid
        order by (m.role = 'owner') desc, m.created_at asc
        limit 1;

        if v_existing is not null then
          return v_existing;
        end if;

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

        -- A pre-existing add_business_owner() trigger may already have done this.
        if not exists (
          select 1 from public.business_members
          where business_id = v_business_id and user_id = v_uid
        ) then
          insert into public.business_members (business_id, user_id, role, full_name)
          values (v_business_id, v_uid, 'owner', v_full_name);
        end if;

        return v_business_id;
      end;
      $fn$;
    $ddl$;
  else
    raise notice 'public.create_business(text, text) already exists; preserved without modification';
  end if;
end
$do$;

-- ---------------------------------------------------------------------
-- 3. POS: complete_sale
--    Optional trailing parameters use defaults, so the existing six-argument
--    client call remains valid while enabling idempotency and store scoping.
-- ---------------------------------------------------------------------

create or replace function public.complete_sale(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method text default 'Cash',
  p_paid numeric default 0,
  p_discount numeric default 0,
  p_customer_id uuid default null,
  p_idempotency_key text default null,
  p_store_id uuid default null
)
returns table (
  sale_id uuid,
  receipt_number text,
  total numeric,
  change_due numeric
)
language plpgsql
security definer
set search_path = ''
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
  v_existing uuid;
  v_receipt text;
  v_customer uuid := p_customer_id;
  v_credit_limit numeric;
  v_balance numeric;
  v_can_discount boolean := false;
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

  v_can_discount := public.app_has_business_role(
    p_business_id,
    array['owner', 'admin', 'manager']
  );

  if v_discount < 0 then
    raise exception 'INVALID_DISCOUNT' using errcode = '22023';
  end if;

  if v_discount > 0 and not v_can_discount then
    raise exception 'DISCOUNT_NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_paid < 0 then
    raise exception 'INVALID_PAYMENT' using errcode = '22023';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select s.id, s.receipt_number, s.total, s.change_due
      into v_sale_id, v_receipt, v_total, v_change
      from public.sales s
     where s.business_id = p_business_id
       and s.idempotency_key = p_idempotency_key
     limit 1;

    if v_sale_id is not null then
      return query select v_sale_id, v_receipt, v_total, v_change;
      return;
    end if;
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores
    where id = p_store_id and business_id = p_business_id
  ) then
    raise exception 'STORE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_customer is not null and not exists (
    select 1 from public.customers
    where id = v_customer and business_id = p_business_id
  ) then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Validate every line first with locked rows and database-owned prices.
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

    if v_product.quantity < v_qty then
      raise exception 'INSUFFICIENT_STOCK:%', v_product.name using errcode = 'P0001';
    end if;

    v_subtotal := v_subtotal + round(v_qty * v_product.selling_price, 2);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'EMPTY_CART' using errcode = '22023';
  end if;

  if v_discount > v_subtotal then
    raise exception 'INVALID_DISCOUNT' using errcode = '22023';
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  if v_customer is null and v_paid < v_total then
    raise exception 'INSUFFICIENT_PAYMENT' using errcode = '22023';
  end if;

  if v_customer is not null and v_paid < v_total then
    select credit_limit, balance into v_credit_limit, v_balance
    from public.customers
    where id = v_customer and business_id = p_business_id;

    if (v_total - v_paid) > greatest(0, v_credit_limit - v_balance) then
      raise exception 'CREDIT_LIMIT_EXCEEDED' using errcode = '22023';
    end if;

    update public.customers
    set balance = balance + (v_total - v_paid),
        updated_at = now()
    where id = v_customer and business_id = p_business_id;
  end if;

  v_change := greatest(0, round(v_paid - v_total, 2));

  v_receipt := 'BM-'
    || to_char(now() at time zone 'Africa/Dar_es_Salaam', 'YYMMDD')
    || '-' || lpad(nextval('public.sale_receipt_seq')::text, 4, '0');

  insert into public.sales (
    business_id, store_id, customer_id, subtotal, discount,
    total, paid, change_due, payment_method, status, served_by,
    idempotency_key
  )
  values (
    p_business_id, p_store_id, v_customer, v_subtotal, v_discount,
    v_total, v_paid, v_change,
    coalesce(nullif(p_payment_method, ''), 'Cash'), 'completed', v_uid,
    p_idempotency_key
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

    if not found then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_product.quantity < v_qty then
      raise exception 'INSUFFICIENT_STOCK:%', v_product.name using errcode = 'P0001';
    end if;

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
    set quantity = quantity - v_qty,
        updated_at = now()
    where id = v_product.id and business_id = p_business_id;

    insert into public.stock_movements (
      business_id, store_id, product_id, movement_type, quantity,
      quantity_before, quantity_after, unit_cost,
      reference_type, reference_id, created_by
    )
    values (
      p_business_id, coalesce(p_store_id, v_product.store_id), v_product.id, 'sale', v_qty,
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

-- ---------------------------------------------------------------------
-- 4. Cancel / refund a sale
-- ---------------------------------------------------------------------

create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
  v_after numeric;
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
      set quantity = quantity + v_item.quantity,
          updated_at = now()
      where id = v_item.product_id and business_id = v_sale.business_id
      returning quantity into v_after;

      insert into public.stock_movements (
        business_id, store_id, product_id, movement_type, quantity,
        quantity_before, quantity_after, unit_cost,
        reference_type, reference_id, created_by, note
      )
      values (
        v_sale.business_id, v_sale.store_id, v_item.product_id, 'refund', v_item.quantity,
        v_after - v_item.quantity, v_after, v_item.unit_cost,
        'sale', v_sale.id, v_uid, p_reason
      );
    end if;
  end loop;

  if v_sale.customer_id is not null and v_sale.paid < v_sale.total then
    update public.customers
    set balance = greatest(0, balance - (v_sale.total - v_sale.paid)),
        updated_at = now()
    where id = v_sale.customer_id and business_id = v_sale.business_id;
  end if;

  update public.sales
  set status = 'cancelled',
      cancelled_reason = p_reason
  where id = p_sale_id;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    v_sale.business_id, v_uid, 'sale.cancelled', 'sales', p_sale_id,
    jsonb_build_object('receipt', v_sale.receipt_number, 'reason', p_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Audited stock adjustment
-- ---------------------------------------------------------------------

create or replace function public.adjust_stock(
  p_business_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_note text default null,
  p_idempotency_key text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_product public.products%rowtype;
  v_existing uuid;
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

  if p_movement_type is null
     or p_movement_type not in ('in', 'out', 'adjustment', 'damage', 'transfer') then
    raise exception 'INVALID_MOVEMENT_TYPE' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing
    from public.stock_movements
    where business_id = p_business_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_existing is not null then
      select quantity into v_after
      from public.products
      where id = p_product_id and business_id = p_business_id;
      return v_after;
    end if;
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

  if v_delta = 0 then
    raise exception 'NO_CHANGE' using errcode = '22023';
  end if;

  update public.products
  set quantity = v_after,
      updated_at = now()
  where id = v_product.id and business_id = p_business_id;

  insert into public.stock_movements (
    business_id, store_id, product_id, movement_type, quantity,
    quantity_before, quantity_after, unit_cost, note,
    idempotency_key, created_by
  )
  values (
    p_business_id, v_product.store_id, v_product.id, p_movement_type, abs(v_delta),
    v_before, v_after, v_product.buying_price, p_note,
    p_idempotency_key, v_uid
  );

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    p_business_id, v_uid, 'stock.' || p_movement_type, 'products', v_product.id,
    jsonb_build_object('before', v_before, 'after', v_after, 'note', p_note)
  );

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Purchases and supplier payments
-- ---------------------------------------------------------------------

create or replace function public.record_purchase(
  p_business_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_paid numeric default 0,
  p_purchase_date date default current_date,
  p_note text default null,
  p_idempotency_key text default null,
  p_store_id uuid default null
)
returns table (
  purchase_id uuid,
  reference text,
  total numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_existing uuid;
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

  if v_paid < 0 then
    raise exception 'INVALID_PAYMENT' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select id, reference, total into v_purchase_id, v_reference, v_total
    from public.purchases
    where business_id = p_business_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_purchase_id is not null then
      return query select v_purchase_id, v_reference, v_total;
      return;
    end if;
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and business_id = p_business_id
  ) then
    raise exception 'SUPPLIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores
    where id = p_store_id and business_id = p_business_id
  ) then
    raise exception 'STORE_NOT_FOUND' using errcode = 'P0002';
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

  if v_paid > v_total then
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
    business_id, store_id, supplier_id, reference, purchase_date,
    subtotal, total, paid, status, note, idempotency_key, created_by
  )
  values (
    p_business_id, p_store_id, p_supplier_id, v_reference,
    coalesce(p_purchase_date, current_date),
    v_total, v_total, v_paid, v_status, p_note, p_idempotency_key, v_uid
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
            buying_price = v_price,
            updated_at = now()
        where id = v_product.id and business_id = p_business_id;

        insert into public.stock_movements (
          business_id, store_id, product_id, movement_type, quantity,
          quantity_before, quantity_after, unit_cost,
          reference_type, reference_id, created_by
        )
        values (
          p_business_id, coalesce(p_store_id, v_product.store_id), v_product.id, 'purchase', v_qty,
          v_product.quantity, v_product.quantity + v_qty, v_price,
          'purchase', v_purchase_id, v_uid
        );
      end if;
    end if;
  end loop;

  if p_supplier_id is not null and v_total > v_paid then
    update public.suppliers
    set balance = balance + (v_total - v_paid),
        updated_at = now()
    where id = p_supplier_id and business_id = p_business_id;
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
    jsonb_build_object('reference', v_reference, 'total', v_total, 'paid', v_paid)
  );

  return query select v_purchase_id, v_reference, v_total;
end;
$$;

create or replace function public.record_supplier_payment(
  p_purchase_id uuid,
  p_amount numeric,
  p_payment_method text default 'Cash',
  p_note text default null,
  p_idempotency_key text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_purchase public.purchases%rowtype;
  v_existing uuid;
  v_remaining numeric;
  v_new_paid numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing
    from public.supplier_payments
    where business_id = (select business_id from public.purchases where id = p_purchase_id)
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_existing is not null then
      return 0;
    end if;
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
  v_new_paid := v_purchase.paid + p_amount;

  if p_amount > v_remaining then
    raise exception 'AMOUNT_EXCEEDS_BALANCE' using errcode = '22023';
  end if;

  update public.purchases
  set paid = v_new_paid,
      status = case when v_new_paid >= total then 'paid' else 'partial' end
  where id = p_purchase_id;

  insert into public.supplier_payments (
    business_id, supplier_id, purchase_id, amount, payment_method, note,
    idempotency_key, created_by
  )
  values (
    v_purchase.business_id, v_purchase.supplier_id, p_purchase_id,
    p_amount, coalesce(nullif(p_payment_method, ''), 'Cash'), p_note,
    p_idempotency_key, v_uid
  );

  if v_purchase.supplier_id is not null then
    update public.suppliers
    set balance = greatest(0, balance - p_amount),
        updated_at = now()
    where id = v_purchase.supplier_id and business_id = v_purchase.business_id;
  end if;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    v_purchase.business_id, v_uid, 'purchase.payment', 'purchases', p_purchase_id,
    jsonb_build_object('amount', p_amount)
  );

  return v_remaining - p_amount;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Customer credit payments
-- ---------------------------------------------------------------------

create or replace function public.record_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_payment_method text default 'Cash',
  p_note text default null,
  p_idempotency_key text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_customer public.customers%rowtype;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

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
  where id = p_customer_id and business_id = v_customer.business_id;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    v_customer.business_id, v_uid, 'customer.payment', 'customers', p_customer_id,
    jsonb_build_object('amount', p_amount, 'idempotency_key', p_idempotency_key)
  );

  return v_customer.balance - p_amount;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Server-authoritative dashboard and report aggregates
-- ---------------------------------------------------------------------

create or replace function public.get_dashboard_summary(
  p_business_id uuid,
  p_days integer default 7
)
returns table (
  revenue numeric,
  expenses numeric,
  profit numeric,
  receivables numeric,
  payables numeric,
  low_stock_items integer,
  out_of_stock_items integer,
  sales_count integer,
  last_sale_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 365));
begin
  if not public.app_is_business_member(p_business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return query
  with sale_stats as (
    select
      coalesce(sum(s.total), 0) as sale_revenue,
      count(*)::integer as sale_count,
      max(s.created_at) as latest_sale
    from public.sales s
    where s.business_id = p_business_id
      and s.status = 'completed'
      and s.created_at >= now() - make_interval(days => v_days)
  ),
  expense_stats as (
    select coalesce(sum(e.amount), 0) as total_expenses
    from public.expenses e
    where e.business_id = p_business_id
      and e.expense_date >= current_date - v_days
  ),
  balance_stats as (
    select
      coalesce((
        select sum(c.balance) from public.customers c
        where c.business_id = p_business_id
      ), 0) as total_receivables,
      coalesce((
        select sum(su.balance) from public.suppliers su
        where su.business_id = p_business_id
      ), 0) as total_payables
  ),
  stock_stats as (
    select
      count(*) filter (where quantity <= low_stock_level and quantity > 0)::integer as low_count,
      count(*) filter (where quantity <= 0)::integer as out_count
    from public.products
    where business_id = p_business_id
      and is_archived = false
  )
  select
    ss.sale_revenue,
    es.total_expenses,
    ss.sale_revenue - es.total_expenses,
    bs.total_receivables,
    bs.total_payables,
    sts.low_count,
    sts.out_count,
    ss.sale_count,
    ss.latest_sale
  from sale_stats ss
  cross join expense_stats es
  cross join balance_stats bs
  cross join stock_stats sts;
end;
$$;

create or replace function public.get_report_summary(
  p_business_id uuid,
  p_from date,
  p_to date
)
returns table (
  revenue numeric,
  cost_of_goods_sold numeric,
  gross_profit numeric,
  expenses numeric,
  net_profit numeric,
  sale_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_DATE_RANGE' using errcode = '22023';
  end if;

  if not public.app_is_business_member(p_business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return query
  with sales_in_range as (
    select s.id, s.total
    from public.sales s
    where s.business_id = p_business_id
      and s.status = 'completed'
      and s.created_at >= p_from::timestamp
      and s.created_at < (p_to + 1)::timestamp
  ),
  revenue_stats as (
    select coalesce(sum(total), 0) as total_revenue,
           count(*)::integer as total_sales
    from sales_in_range
  ),
  cogs_stats as (
    select coalesce(sum(si.quantity * si.unit_cost), 0) as total_cogs
    from public.sale_items si
    join sales_in_range sr on sr.id = si.sale_id
    where si.business_id = p_business_id
  ),
  expense_stats as (
    select coalesce(sum(e.amount), 0) as total_expenses
    from public.expenses e
    where e.business_id = p_business_id
      and e.expense_date between p_from and p_to
  )
  select
    r.total_revenue,
    c.total_cogs,
    r.total_revenue - c.total_cogs,
    e.total_expenses,
    r.total_revenue - c.total_cogs - e.total_expenses,
    r.total_sales
  from revenue_stats r
  cross join cogs_stats c
  cross join expense_stats e;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Safe purchase deletion with stock and balance reversal
--    The current Purchases page deletes directly from the table. That must be
--    changed to call this RPC after approval; direct delete is intentionally
--    not granted by the new-table RLS draft.
-- ---------------------------------------------------------------------

create or replace function public.delete_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_purchase public.purchases%rowtype;
  v_item public.purchase_items%rowtype;
  v_after numeric;
  v_allow_negative boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'PURCHASE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.app_has_business_role(v_purchase.business_id, array['owner', 'admin']) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select coalesce(allow_negative_stock, false) into v_allow_negative
  from public.businesses
  where id = v_purchase.business_id;

  for v_item in
    select * from public.purchase_items where purchase_id = p_purchase_id
  loop
    if v_item.product_id is not null then
      update public.products
      set quantity = quantity - v_item.quantity,
          updated_at = now()
      where id = v_item.product_id
        and business_id = v_purchase.business_id
      returning quantity into v_after;

      if not found then
        raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
      end if;

      if v_after < 0 and not coalesce(v_allow_negative, false) then
        raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
      end if;

      insert into public.stock_movements (
        business_id, store_id, product_id, movement_type, quantity,
        quantity_before, quantity_after, unit_cost,
        reference_type, reference_id, created_by, note
      )
      values (
        v_purchase.business_id, v_purchase.store_id, v_item.product_id,
        'purchase_reversal', v_item.quantity,
        v_after + v_item.quantity, v_after, v_item.unit_price,
        'purchase', p_purchase_id, v_uid, 'Purchase deleted'
      );
    end if;
  end loop;

  if v_purchase.supplier_id is not null then
    update public.suppliers
    set balance = greatest(0, balance - (v_purchase.total - v_purchase.paid)),
        updated_at = now()
    where id = v_purchase.supplier_id
      and business_id = v_purchase.business_id;
  end if;

  delete from public.supplier_payments where purchase_id = p_purchase_id;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    v_purchase.business_id, v_uid, 'purchase.deleted', 'purchases', p_purchase_id,
    jsonb_build_object('reference', v_purchase.reference, 'total', v_purchase.total)
  );

  delete from public.purchases where id = p_purchase_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Team administration
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
set search_path = ''
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

create or replace function public.revoke_business_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
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

create or replace function public.update_member_role(
  p_member_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
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

  update public.business_members
  set role = p_role,
      updated_at = now()
  where id = p_member_id;

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    v_member.business_id, v_uid, 'member.role_updated', 'business_members', p_member_id,
    jsonb_build_object('from', v_member.role, 'to', p_role)
  );
end;
$$;

create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
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

  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, details)
  values (
    v_member.business_id, v_uid, 'member.removed', 'business_members', p_member_id,
    jsonb_build_object('role', v_member.role)
  );

  delete from public.business_members where id = p_member_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 11. Explicit privilege hardening
--     CREATE FUNCTION grants EXECUTE to PUBLIC by default. Revoke it.
--     The pre-existing get_my_workspace() keeps EXECUTE for authenticated.
-- ---------------------------------------------------------------------

revoke all on function public.app_is_business_member(uuid) from public, anon;
revoke all on function public.app_has_business_role(uuid, text[]) from public, anon;
revoke all on function public.create_business(text, text) from public, anon;
revoke all on function public.get_my_workspace() from public, anon;
revoke all on function public.complete_sale(uuid, jsonb, text, numeric, numeric, uuid, uuid, uuid) from public, anon;
revoke all on function public.cancel_sale(uuid, text) from public, anon;
revoke all on function public.adjust_stock(uuid, uuid, text, numeric, text, uuid) from public, anon;
revoke all on function public.record_purchase(uuid, uuid, jsonb, numeric, date, text, uuid, uuid) from public, anon;
revoke all on function public.record_supplier_payment(uuid, numeric, text, text, uuid) from public, anon;
revoke all on function public.record_customer_payment(uuid, numeric, text, text, uuid) from public, anon;
revoke all on function public.get_dashboard_summary(uuid, integer) from public, anon;
revoke all on function public.get_report_summary(uuid, date, date) from public, anon;
revoke all on function public.delete_purchase(uuid) from public, anon;
revoke all on function public.list_business_invitations(uuid) from public, anon;
revoke all on function public.revoke_business_invitation(uuid) from public, anon;
revoke all on function public.update_member_role(uuid, text) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;

grant execute on function public.app_is_business_member(uuid) to authenticated;
grant execute on function public.app_has_business_role(uuid, text[]) to authenticated;
grant execute on function public.create_business(text, text) to authenticated;
grant execute on function public.get_my_workspace() to authenticated;
grant execute on function public.complete_sale(uuid, jsonb, text, numeric, numeric, uuid, uuid, uuid) to authenticated;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, text, numeric, text, uuid) to authenticated;
grant execute on function public.record_purchase(uuid, uuid, jsonb, numeric, date, text, uuid, uuid) to authenticated;
grant execute on function public.record_supplier_payment(uuid, numeric, text, text, uuid) to authenticated;
grant execute on function public.record_customer_payment(uuid, numeric, text, text, uuid) to authenticated;
grant execute on function public.get_dashboard_summary(uuid, integer) to authenticated;
grant execute on function public.get_report_summary(uuid, date, date) to authenticated;
grant execute on function public.delete_purchase(uuid) to authenticated;
grant execute on function public.list_business_invitations(uuid) to authenticated;
grant execute on function public.revoke_business_invitation(uuid) to authenticated;
grant execute on function public.update_member_role(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;

commit;
