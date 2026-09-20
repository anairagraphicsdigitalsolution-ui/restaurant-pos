-- Anaira POS Operations finalization.
-- Inventory is intentionally not referenced.

alter table public.kot_tickets
  add column if not exists notes text;

create or replace function public.assign_kot_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kot_no is null then
    perform pg_advisory_xact_lock(hashtext('anaira-kot-' || new.restaurant_id::text));
    select coalesce(max(kot_no), 0) + 1
      into new.kot_no
    from public.kot_tickets
    where restaurant_id = new.restaurant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_kot_number on public.kot_tickets;
create trigger trg_assign_kot_number
before insert on public.kot_tickets
for each row execute function public.assign_kot_number();

create index if not exists idx_kot_restaurant_status
  on public.kot_tickets(restaurant_id, status, created_at desc);

-- Link modifier groups to menu items so modifiers can be assigned
-- without touching inventory or stock tables.
create table if not exists public.menu_item_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  modifier_group_id uuid not null references public.modifier_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(menu_item_id, modifier_group_id)
);

create index if not exists idx_menu_item_modifier_groups_item
  on public.menu_item_modifier_groups(restaurant_id, menu_item_id);

alter table public.menu_item_modifier_groups enable row level security;

drop policy if exists menu_item_modifier_groups_scoped on public.menu_item_modifier_groups;
create policy menu_item_modifier_groups_scoped
on public.menu_item_modifier_groups
for all
using (public.is_restaurant_member(restaurant_id))
with check (public.is_restaurant_member(restaurant_id));

-- Safe helper for staff UI. This is only an access lookup; it does not
-- grant database privileges by itself.
create or replace function public.has_staff_permission(
  p_staff_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.profiles p
      left join public.staff_permissions sp
        on sp.staff_id = p.id
       and sp.restaurant_id = p.restaurant_id
       and sp.permission_key = p_permission_key
       and sp.enabled = true
      where p.id = p_staff_id
        and (
          p.role in ('admin','super_admin')
          or sp.id is not null
        )
    );
$$;

grant execute on function public.has_staff_permission(uuid,text) to authenticated;

-- Anaira POS final billing hardening.
-- Inventory remains intentionally disconnected.
-- Modifier charges are included in server-side billing totals.

CREATE OR REPLACE FUNCTION public.stage3_finalize_order(
  p_order_id uuid,
  p_payment_method text DEFAULT 'cash',
  p_paid_amount numeric DEFAULT 0,
  p_offer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_order public.orders%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_offer public.offers%ROWTYPE;
  v_item record;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := GREATEST(COALESCE(p_paid_amount, 0), 0);
  v_payment_status text;
  v_invoice_seq bigint;
  v_invoice_no text;
  v_discount_type text;
  v_discount_value numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_profile
  FROM public.stage3_current_profile();

  IF v_profile.user_id IS NULL
     OR v_profile.role NOT IN ('admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_profile.role <> 'super_admin'
     AND v_order.restaurant_id <> v_profile.restaurant_id THEN
    RAISE EXCEPTION 'Order belongs to another restaurant';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled order cannot be billed';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'Order is already paid';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = v_order.restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  -- Snapshot prices for legacy orders that predate Stage 2.
  -- New QR orders already contain unit_price/item_name.
  FOR v_item IN
    SELECT oi.id, oi.item_id, oi.quantity, oi.unit_price, mi.name, mi.price
    FROM public.order_items oi
    LEFT JOIN public.menu_items mi ON mi.id = oi.item_id
    WHERE oi.order_id = v_order.id
    FOR UPDATE OF oi
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity < 1 THEN
      RAISE EXCEPTION 'Invalid order quantity';
    END IF;

    IF v_item.unit_price IS NULL THEN
      IF v_item.price IS NULL THEN
        RAISE EXCEPTION 'Menu price missing for order item';
      END IF;

      UPDATE public.order_items
      SET
        item_name = COALESCE(item_name, v_item.name),
        unit_price = v_item.price,
        line_total = v_item.price * v_item.quantity
      WHERE id = v_item.id;
    ELSE
      UPDATE public.order_items
      SET line_total = COALESCE(line_total, unit_price * quantity),
          item_name = COALESCE(item_name, v_item.name)
      WHERE id = v_item.id;
    END IF;
  END LOOP;

  SELECT COALESCE(
    SUM(
      COALESCE(oi.line_total, oi.unit_price * oi.quantity)
      + COALESCE((
          SELECT SUM(COALESCE(oim.price, 0) * COALESCE(oim.quantity, 1))
          FROM public.order_item_modifiers oim
          WHERE oim.order_item_id = oi.id
        ), 0) * oi.quantity
    ), 0)
    INTO v_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id;

  -- Choose an explicitly requested valid offer, otherwise the best
  -- active percentage/flat offer that currently applies.
  IF p_offer_id IS NOT NULL THEN
    SELECT * INTO v_offer
    FROM public.offers
    WHERE id = p_offer_id
      AND restaurant_id = v_order.restaurant_id
      AND COALESCE(active, true)
      AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
      AND (valid_till IS NULL OR valid_till >= CURRENT_DATE)
      AND COALESCE(min_order, 0) <= v_subtotal;
  END IF;

  IF v_offer.id IS NULL THEN
    SELECT * INTO v_offer
    FROM public.offers
    WHERE restaurant_id = v_order.restaurant_id
      AND COALESCE(active, true)
      AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
      AND (valid_till IS NULL OR valid_till >= CURRENT_DATE)
      AND COALESCE(min_order, 0) <= v_subtotal
    ORDER BY discount DESC NULLS LAST, created_at DESC
    LIMIT 1;
  END IF;

  IF v_offer.id IS NOT NULL THEN
    v_discount_type := lower(COALESCE(v_offer.discount_type, 'percent'));
    v_discount_value := GREATEST(COALESCE(v_offer.discount, 0), 0);

    IF v_discount_type = 'flat' THEN
      v_discount := LEAST(v_subtotal, v_discount_value);
    ELSE
      v_discount := LEAST(v_subtotal, v_subtotal * LEAST(v_discount_value, 100) / 100);
    END IF;
  END IF;

  IF COALESCE(v_restaurant.gst_enabled, true) THEN
    v_tax := ROUND(
      GREATEST(v_subtotal - v_discount, 0)
      * GREATEST(COALESCE(v_restaurant.gst_rate, 0), 0)
      / 100,
      2
    );
  END IF;

  v_total := ROUND(GREATEST(v_subtotal - v_discount, 0) + v_tax, 2);

  IF v_paid > v_total THEN
    v_paid := v_total;
  END IF;

  IF v_paid >= v_total AND v_total > 0 THEN
    v_payment_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_payment_status := 'partially_paid';
  ELSE
    v_payment_status := 'unpaid';
  END IF;

  -- Generate invoice number atomically per restaurant.
  INSERT INTO public.invoice_sequences (restaurant_id, next_number)
  VALUES (v_order.restaurant_id, 1)
  ON CONFLICT (restaurant_id) DO NOTHING;

  SELECT next_number
    INTO v_invoice_seq
  FROM public.invoice_sequences
  WHERE restaurant_id = v_order.restaurant_id
  FOR UPDATE;

  UPDATE public.invoice_sequences
  SET next_number = v_invoice_seq + 1,
      updated_at = now()
  WHERE restaurant_id = v_order.restaurant_id;

  v_invoice_no :=
    'INV-' ||
    to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') ||
    '-' ||
    lpad(v_invoice_seq::text, 6, '0');

  -- INVENTORY INTENTIONALLY DISABLED.
  -- Billing/Finalize is independent of inventory for now.
  -- Inventory tables and functions remain untouched and can be
  -- integrated later in a separate stage.
  UPDATE public.orders
  SET
    subtotal = v_subtotal,
    discount_amount = v_discount,
    tax_amount = v_tax,
    total_amount = v_total,
    offer_id = CASE WHEN v_offer.id IS NULL THEN NULL ELSE v_offer.id END,
    invoice_no = COALESCE(invoice_no, v_invoice_no),
    payment_status = v_payment_status,
    payment_method = NULLIF(left(lower(trim(COALESCE(p_payment_method, 'cash'))), 30), ''),
    paid_amount = v_paid,
    billed_at = COALESCE(billed_at, now())
  WHERE id = v_order.id;

  INSERT INTO public.audit_logs (
    restaurant_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) VALUES (
    v_order.restaurant_id,
    v_profile.user_id,
    'order.finalize',
    'order',
    v_order.id,
    jsonb_build_object(
      'invoice_no', COALESCE(v_order.invoice_no, v_invoice_no),
      'subtotal', v_subtotal,
      'discount', v_discount,
      'tax', v_tax,
      'total', v_total,
      'paid_amount', v_paid,
      'payment_status', v_payment_status,
      'payment_method', p_payment_method
    )
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'invoice_no', COALESCE(v_order.invoice_no, v_invoice_no),
    'subtotal', v_subtotal,
    'discount', v_discount,
    'tax', v_tax,
    'total', v_total,
    'paid_amount', v_paid,
    'payment_status', v_payment_status,
    'payment_method', p_payment_method,
    'offer_id', v_offer.id
  );
END;
$$;



REVOKE ALL ON FUNCTION public.stage3_finalize_order(uuid, text, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage3_finalize_order(uuid, text, numeric, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.stage3_finalize_order(p_actor_id uuid, p_order_id uuid, p_payment_method text DEFAULT 'cash'::text, p_paid_amount numeric DEFAULT 0, p_offer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile record;
  v_order public.orders%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_offer public.offers%ROWTYPE;
  v_item record;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := GREATEST(COALESCE(p_paid_amount, 0), 0);
  v_payment_status text;
  v_invoice_seq bigint;
  v_invoice_no text;
  v_discount_type text;
  v_discount_value numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_profile
  FROM public.stage3_profile_for_actor(p_actor_id);

  IF v_profile.user_id IS NULL
     OR v_profile.role NOT IN ('admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_profile.role <> 'super_admin'
     AND v_order.restaurant_id <> v_profile.restaurant_id THEN
    RAISE EXCEPTION 'Order belongs to another restaurant';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled order cannot be billed';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'Order is already paid';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = v_order.restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  -- Snapshot prices for legacy orders that predate Stage 2.
  -- New QR orders already contain unit_price/item_name.
  FOR v_item IN
    SELECT oi.id, oi.item_id, oi.quantity, oi.unit_price, mi.name, mi.price
    FROM public.order_items oi
    LEFT JOIN public.menu_items mi ON mi.id = oi.item_id
    WHERE oi.order_id = v_order.id
    FOR UPDATE OF oi
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity < 1 THEN
      RAISE EXCEPTION 'Invalid order quantity';
    END IF;

    IF v_item.unit_price IS NULL THEN
      IF v_item.price IS NULL THEN
        RAISE EXCEPTION 'Menu price missing for order item';
      END IF;

      UPDATE public.order_items
      SET
        item_name = COALESCE(item_name, v_item.name),
        unit_price = v_item.price,
        line_total = v_item.price * v_item.quantity
      WHERE id = v_item.id;
    ELSE
      UPDATE public.order_items
      SET line_total = COALESCE(line_total, unit_price * quantity),
          item_name = COALESCE(item_name, v_item.name)
      WHERE id = v_item.id;
    END IF;
  END LOOP;

  SELECT COALESCE(
    SUM(
      COALESCE(oi.line_total, oi.unit_price * oi.quantity)
      + COALESCE((
          SELECT SUM(COALESCE(oim.price, 0) * COALESCE(oim.quantity, 1))
          FROM public.order_item_modifiers oim
          WHERE oim.order_item_id = oi.id
        ), 0) * oi.quantity
    ), 0)
    INTO v_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id;

  -- Choose an explicitly requested valid offer, otherwise the best
  -- active percentage/flat offer that currently applies.
  IF p_offer_id IS NOT NULL THEN
    SELECT * INTO v_offer
    FROM public.offers
    WHERE id = p_offer_id
      AND restaurant_id = v_order.restaurant_id
      AND COALESCE(active, true)
      AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
      AND (valid_till IS NULL OR valid_till >= CURRENT_DATE)
      AND COALESCE(min_order, 0) <= v_subtotal;
  END IF;

  IF v_offer.id IS NULL THEN
    SELECT * INTO v_offer
    FROM public.offers
    WHERE restaurant_id = v_order.restaurant_id
      AND COALESCE(active, true)
      AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
      AND (valid_till IS NULL OR valid_till >= CURRENT_DATE)
      AND COALESCE(min_order, 0) <= v_subtotal
    ORDER BY discount DESC NULLS LAST, created_at DESC
    LIMIT 1;
  END IF;

  IF v_offer.id IS NOT NULL THEN
    v_discount_type := lower(COALESCE(v_offer.discount_type, 'percent'));
    v_discount_value := GREATEST(COALESCE(v_offer.discount, 0), 0);

    IF v_discount_type = 'flat' THEN
      v_discount := LEAST(v_subtotal, v_discount_value);
    ELSE
      v_discount := LEAST(v_subtotal, v_subtotal * LEAST(v_discount_value, 100) / 100);
    END IF;
  END IF;

  IF COALESCE(v_restaurant.gst_enabled, true) THEN
    v_tax := ROUND(
      GREATEST(v_subtotal - v_discount, 0)
      * GREATEST(COALESCE(v_restaurant.gst_rate, 0), 0)
      / 100,
      2
    );
  END IF;

  v_total := ROUND(GREATEST(v_subtotal - v_discount, 0) + v_tax, 2);

  IF v_paid > v_total THEN
    v_paid := v_total;
  END IF;

  IF v_paid >= v_total AND v_total > 0 THEN
    v_payment_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_payment_status := 'partially_paid';
  ELSE
    v_payment_status := 'unpaid';
  END IF;

  -- Generate invoice number atomically per restaurant.
  INSERT INTO public.invoice_sequences (restaurant_id, next_number)
  VALUES (v_order.restaurant_id, 1)
  ON CONFLICT (restaurant_id) DO NOTHING;

  SELECT next_number
    INTO v_invoice_seq
  FROM public.invoice_sequences
  WHERE restaurant_id = v_order.restaurant_id
  FOR UPDATE;

  UPDATE public.invoice_sequences
  SET next_number = v_invoice_seq + 1,
      updated_at = now()
  WHERE restaurant_id = v_order.restaurant_id;

  v_invoice_no :=
    'INV-' ||
    to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') ||
    '-' ||
    lpad(v_invoice_seq::text, 6, '0');

  -- Consume mapped inventory exactly once.

  UPDATE public.orders
  SET
    subtotal = v_subtotal,
    discount_amount = v_discount,
    tax_amount = v_tax,
    total_amount = v_total,
    offer_id = CASE WHEN v_offer.id IS NULL THEN NULL ELSE v_offer.id END,
    invoice_no = COALESCE(invoice_no, v_invoice_no),
    payment_status = v_payment_status,
    payment_method = NULLIF(left(lower(trim(COALESCE(p_payment_method, 'cash'))), 30), ''),
    paid_amount = v_paid,
    billed_at = COALESCE(billed_at, now())
  WHERE id = v_order.id;

  INSERT INTO public.audit_logs (
    restaurant_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) VALUES (
    v_order.restaurant_id,
    v_profile.user_id,
    'order.finalize',
    'order',
    v_order.id,
    jsonb_build_object(
      'invoice_no', COALESCE(v_order.invoice_no, v_invoice_no),
      'subtotal', v_subtotal,
      'discount', v_discount,
      'tax', v_tax,
      'total', v_total,
      'paid_amount', v_paid,
      'payment_status', v_payment_status,
      'payment_method', p_payment_method
    )
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'invoice_no', COALESCE(v_order.invoice_no, v_invoice_no),
    'subtotal', v_subtotal,
    'discount', v_discount,
    'tax', v_tax,
    'total', v_total,
    'paid_amount', v_paid,
    'payment_status', v_payment_status,
    'payment_method', p_payment_method,
    'offer_id', v_offer.id
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.stage3_finalize_order(uuid, text, numeric, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.stage3_finalize_order(uuid, text, numeric, uuid)
  TO authenticated;


REVOKE ALL ON FUNCTION public.stage3_finalize_order(uuid, uuid, text, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage3_finalize_order(uuid, uuid, text, numeric, uuid)
  TO authenticated;
