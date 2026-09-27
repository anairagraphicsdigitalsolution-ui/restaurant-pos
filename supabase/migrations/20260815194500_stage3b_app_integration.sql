
BEGIN;

-- Stage 3B: trusted server APIs pass the verified auth user id explicitly.
CREATE OR REPLACE FUNCTION public.stage3_profile_for_actor(p_actor_id uuid)
RETURNS TABLE (
  user_id uuid,
  restaurant_id uuid,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.restaurant_id, p.role
  FROM public.profiles p
  WHERE p.id = p_actor_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.stage3_profile_for_actor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_profile_for_actor(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.stage3_adjust_inventory(  p_actor_id uuid,
  p_inventory_id uuid,
  p_delta integer,
  p_reason text DEFAULT 'manual adjustment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_inventory public.inventory%ROWTYPE;
  v_new_qty integer;
BEGIN
  SELECT * INTO v_profile
  FROM public.stage3_profile_for_actor(p_actor_id);

  IF v_profile.user_id IS NULL
     OR v_profile.role NOT IN ('admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_inventory
  FROM public.inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  IF v_profile.role <> 'super_admin'
     AND v_inventory.restaurant_id <> v_profile.restaurant_id THEN
    RAISE EXCEPTION 'Inventory item belongs to another restaurant';
  END IF;

  v_new_qty := COALESCE(v_inventory.quantity, 0) + COALESCE(p_delta, 0);

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  UPDATE public.inventory
  SET quantity = v_new_qty
  WHERE id = p_inventory_id;

  INSERT INTO public.inventory_transactions (
    restaurant_id,
    inventory_id,
    transaction_type,
    quantity_delta,
    quantity_after,
    reason,
    actor_id
  ) VALUES (
    v_inventory.restaurant_id,
    v_inventory.id,
    CASE WHEN p_delta >= 0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
    p_delta,
    v_new_qty,
    left(coalesce(p_reason, 'manual adjustment'), 500),
    v_profile.user_id
  );

  INSERT INTO public.audit_logs (
    restaurant_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) VALUES (
    v_inventory.restaurant_id,
    v_profile.user_id,
    'inventory.adjust',
    'inventory',
    v_inventory.id,
    jsonb_build_object('quantity', COALESCE(v_inventory.quantity, 0)),
    jsonb_build_object('quantity', v_new_qty, 'delta', p_delta)
  );

  RETURN jsonb_build_object(
    'inventory_id', v_inventory.id,
    'quantity', v_new_qty
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage3_adjust_inventory(uuid, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage3_adjust_inventory(uuid, integer, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.stage3_consume_order_inventory(  p_actor_id uuid,
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_profile record;
  v_oi record;
  v_ing record;
  v_inventory public.inventory%ROWTYPE;
  v_required integer;
  v_new_qty integer;
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

  IF COALESCE(v_order.inventory_consumed, false) THEN
    RETURN;
  END IF;

  FOR v_oi IN
    SELECT oi.item_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    FOR v_ing IN
      SELECT inventory_id, quantity_used
      FROM public.item_ingredients
      WHERE menu_item_id = v_oi.item_id
    LOOP
      v_required := COALESCE(v_ing.quantity_used, 0)
                    * COALESCE(v_oi.quantity, 0);

      IF v_required <= 0 THEN
        CONTINUE;
      END IF;

      SELECT * INTO v_inventory
      FROM public.inventory
      WHERE id = v_ing.inventory_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Ingredient inventory item not found';
      END IF;

      IF v_inventory.restaurant_id <> v_order.restaurant_id THEN
        RAISE EXCEPTION 'Ingredient belongs to another restaurant';
      END IF;

      IF COALESCE(v_inventory.quantity, 0) < v_required THEN
        RAISE EXCEPTION
          'Insufficient stock for % (required %, available %)',
          COALESCE(v_inventory.name, 'inventory item'),
          v_required,
          COALESCE(v_inventory.quantity, 0);
      END IF;

      v_new_qty := v_inventory.quantity - v_required;

      UPDATE public.inventory
      SET quantity = v_new_qty
      WHERE id = v_inventory.id;

      INSERT INTO public.inventory_transactions (
        restaurant_id,
        inventory_id,
        transaction_type,
        quantity_delta,
        quantity_after,
        reference_id,
        reason,
        actor_id
      ) VALUES (
        v_order.restaurant_id,
        v_inventory.id,
        'order_consumption',
        -v_required,
        v_new_qty,
        v_order.id,
        'Order inventory consumption',
        v_profile.user_id
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  UPDATE public.orders
  SET inventory_consumed = true
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.stage3_consume_order_inventory(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage3_consume_order_inventory(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.stage3_finalize_order(  p_actor_id uuid,
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
    FOR UPDATE
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

  SELECT COALESCE(SUM(COALESCE(line_total, unit_price * quantity)), 0)
    INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_order.id;

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
  PERFORM public.stage3_consume_order_inventory(p_actor_id, v_order.id);

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

CREATE OR REPLACE FUNCTION public.stage3_create_reservation(  p_actor_id uuid,
  p_table_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_name text,
  p_phone text DEFAULT NULL,
  p_guests integer DEFAULT 1,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_restaurant_id uuid;
  v_id uuid;
BEGIN
  SELECT * INTO v_profile
  FROM public.stage3_profile_for_actor(p_actor_id);

  IF v_profile.user_id IS NULL
     OR v_profile.role NOT IN ('admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Invalid reservation time';
  END IF;

  IF COALESCE(p_guests, 0) < 1 THEN
    RAISE EXCEPTION 'Guests must be at least 1';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM public.tables
  WHERE id = p_table_id;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Table not found';
  END IF;

  IF v_profile.role <> 'super_admin'
     AND v_restaurant_id <> v_profile.restaurant_id THEN
    RAISE EXCEPTION 'Table belongs to another restaurant';
  END IF;

  -- Serialize reservations for the same restaurant/table.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_restaurant_id::text || ':' || p_table_id::text,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.reservations r
    WHERE r.restaurant_id = v_restaurant_id
      AND r.table_id = p_table_id
      AND COALESCE(lower(r.status), 'pending')
          NOT IN ('cancelled', 'canceled', 'rejected')
      AND r.reservation_start_at IS NOT NULL
      AND r.reservation_end_at IS NOT NULL
      AND tstzrange(r.reservation_start_at, r.reservation_end_at, '[)')
          && tstzrange(p_start_at, p_end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Table is already reserved for this time';
  END IF;

  INSERT INTO public.reservations (
    name,
    phone,
    table_id,
    date,
    time,
    status,
    guests,
    duration,
    reservation_start_at,
    reservation_end_at,
    notes,
    restaurant_id
  ) VALUES (
    left(COALESCE(p_name, 'Guest'), 120),
    left(COALESCE(p_phone, ''), 40),
    p_table_id,
    (p_start_at AT TIME ZONE 'Asia/Kolkata')::date,
    to_char(p_start_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI'),
    'pending',
    p_guests,
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60)::integer),
    p_start_at,
    p_end_at,
    left(COALESCE(p_notes, ''), 1000),
    v_restaurant_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (
    restaurant_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) VALUES (
    v_restaurant_id,
    v_profile.user_id,
    'reservation.create',
    'reservation',
    v_id,
    jsonb_build_object(
      'table_id', p_table_id,
      'start_at', p_start_at,
      'end_at', p_end_at,
      'guests', p_guests
    )
  );

  RETURN jsonb_build_object(
    'reservation_id', v_id,
    'restaurant_id', v_restaurant_id,
    'table_id', p_table_id,
    'start_at', p_start_at,
    'end_at', p_end_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage3_create_reservation(
  uuid, timestamptz, timestamptz, text, text, integer, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage3_create_reservation(
  uuid, timestamptz, timestamptz, text, text, integer, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.stage3_update_order_status(  p_actor_id uuid,
  p_order_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_order public.orders%ROWTYPE;
  v_new_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  SELECT * INTO v_profile
  FROM public.stage3_profile_for_actor(p_actor_id);

  IF v_profile.user_id IS NULL
     OR v_profile.role NOT IN ('admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_new_status NOT IN ('pending', 'preparing', 'done', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid order status';
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

  IF v_order.payment_status = 'paid' AND v_new_status = 'cancelled' THEN
    RAISE EXCEPTION 'Paid order cannot be cancelled from this operation';
  END IF;

  UPDATE public.orders
  SET
    status = v_new_status,
    cancelled_at = CASE WHEN v_new_status = 'cancelled' THEN now() ELSE cancelled_at END,
    cancellation_reason = CASE
      WHEN v_new_status = 'cancelled'
      THEN left(COALESCE(p_reason, ''), 500)
      ELSE cancellation_reason
    END
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (
    restaurant_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) VALUES (
    v_order.restaurant_id,
    v_profile.user_id,
    'order.status_change',
    'order',
    v_order.id,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object(
      'status', v_new_status,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage3_update_order_status(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage3_update_order_status(uuid, text, text)
  TO authenticated;


REVOKE ALL ON FUNCTION public.stage3_adjust_inventory(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_adjust_inventory(uuid, uuid, integer, text) TO service_role;

REVOKE ALL ON FUNCTION public.stage3_consume_order_inventory(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_consume_order_inventory(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.stage3_finalize_order(uuid, uuid, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_finalize_order(uuid, uuid, text, numeric, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.stage3_create_reservation(uuid, uuid, timestamptz, timestamptz, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_create_reservation(uuid, uuid, timestamptz, timestamptz, text, text, integer, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.stage3_update_order_status(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_update_order_status(uuid, uuid, text, text)
  TO service_role;


-- ------------------------------------------------------------
-- Reservation update/delete for the trusted server API.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stage3_update_reservation(
  p_actor_id uuid,
  p_reservation_id uuid,
  p_table_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_name text,
  p_phone text DEFAULT NULL,
  p_guests integer DEFAULT 1,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_res public.reservations%ROWTYPE;
  v_restaurant_id uuid;
BEGIN
  SELECT * INTO v_profile FROM public.stage3_profile_for_actor(p_actor_id);

  IF v_profile.user_id IS NULL
     OR v_profile.role NOT IN ('admin','staff','super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_profile.role <> 'super_admin'
     AND v_res.restaurant_id <> v_profile.restaurant_id THEN
    RAISE EXCEPTION 'Reservation belongs to another restaurant';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM public.tables
  WHERE id = p_table_id;

  IF v_restaurant_id IS NULL
     OR (v_profile.role <> 'super_admin' AND v_restaurant_id <> v_profile.restaurant_id)
     OR v_restaurant_id <> v_res.restaurant_id THEN
    RAISE EXCEPTION 'Invalid table';
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Invalid reservation time';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_res.restaurant_id::text || ':' || p_table_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.reservations r
    WHERE r.id <> p_reservation_id
      AND r.restaurant_id = v_res.restaurant_id
      AND r.table_id = p_table_id
      AND COALESCE(lower(r.status),'pending')
          NOT IN ('cancelled','canceled','rejected')
      AND r.reservation_start_at IS NOT NULL
      AND r.reservation_end_at IS NOT NULL
      AND tstzrange(r.reservation_start_at, r.reservation_end_at, '[)')
          && tstzrange(p_start_at, p_end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Table is already reserved for this time';
  END IF;

  UPDATE public.reservations
  SET
    name = left(COALESCE(p_name,''),120),
    phone = left(COALESCE(p_phone,''),40),
    table_id = p_table_id,
    date = (p_start_at AT TIME ZONE 'Asia/Kolkata')::date,
    time = to_char(p_start_at AT TIME ZONE 'Asia/Kolkata','HH24:MI'),
    guests = GREATEST(1, COALESCE(p_guests,1)),
    duration = GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_end_at-p_start_at))/60)::integer),
    reservation_start_at = p_start_at,
    reservation_end_at = p_end_at,
    notes = left(COALESCE(p_notes,''),1000)
  WHERE id = p_reservation_id;

  INSERT INTO public.audit_logs(
    restaurant_id, actor_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_res.restaurant_id, v_profile.user_id, 'reservation.update', 'reservation',
    v_res.id,
    jsonb_build_object('table_id',v_res.table_id,'date',v_res.date,'time',v_res.time),
    jsonb_build_object('table_id',p_table_id,'start_at',p_start_at,'end_at',p_end_at)
  );

  RETURN jsonb_build_object('reservation_id',v_res.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.stage3_delete_reservation(
  p_actor_id uuid,
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_res public.reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.stage3_profile_for_actor(p_actor_id);

  IF v_profile.user_id IS NULL
     OR v_profile.role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'Only admin can delete reservations';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_profile.role <> 'super_admin'
     AND v_res.restaurant_id <> v_profile.restaurant_id THEN
    RAISE EXCEPTION 'Reservation belongs to another restaurant';
  END IF;

  DELETE FROM public.reservations WHERE id = p_reservation_id;

  INSERT INTO public.audit_logs(
    restaurant_id, actor_id, action, entity_type, entity_id, before_data
  ) VALUES (
    v_res.restaurant_id, v_profile.user_id, 'reservation.delete',
    'reservation', v_res.id,
    jsonb_build_object('name',v_res.name,'table_id',v_res.table_id,'date',v_res.date,'time',v_res.time)
  );

  RETURN jsonb_build_object('reservation_id',p_reservation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.stage3_update_reservation(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_update_reservation(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, integer, text
) TO service_role;

REVOKE ALL ON FUNCTION public.stage3_delete_reservation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_delete_reservation(uuid, uuid)
  TO service_role;


CREATE OR REPLACE FUNCTION public.stage3_update_reservation_status(
  p_actor_id uuid,
  p_reservation_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_res public.reservations%ROWTYPE;
  v_status text := lower(trim(coalesce(p_status,'')));
BEGIN
  SELECT * INTO v_profile FROM public.stage3_profile_for_actor(p_actor_id);

  IF v_profile.user_id IS NULL
     OR v_profile.role NOT IN ('admin','staff','super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_status NOT IN ('pending','confirmed','cancelled') THEN
    RAISE EXCEPTION 'Invalid reservation status';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_profile.role <> 'super_admin'
     AND v_res.restaurant_id <> v_profile.restaurant_id THEN
    RAISE EXCEPTION 'Reservation belongs to another restaurant';
  END IF;

  UPDATE public.reservations
  SET status = v_status
  WHERE id = p_reservation_id;

  INSERT INTO public.audit_logs(
    restaurant_id, actor_id, action, entity_type, entity_id,
    before_data, after_data
  ) VALUES (
    v_res.restaurant_id, v_profile.user_id, 'reservation.status_change',
    'reservation', v_res.id,
    jsonb_build_object('status',v_res.status),
    jsonb_build_object('status',v_status)
  );

  RETURN jsonb_build_object('reservation_id',v_res.id,'status',v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.stage3_update_reservation_status(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_update_reservation_status(uuid, uuid, text)
  TO service_role;

COMMIT;
