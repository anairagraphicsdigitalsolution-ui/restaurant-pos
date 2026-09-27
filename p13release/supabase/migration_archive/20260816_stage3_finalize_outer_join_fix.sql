-- ============================================================
-- STAGE 3 FINALIZE FIX
-- Fixes:
--   ERROR: FOR UPDATE cannot be applied to the nullable side
--          of an outer join
--
-- Cause:
--   stage3_finalize_order() used:
--     order_items LEFT JOIN menu_items ... FOR UPDATE
--   PostgreSQL cannot apply FOR UPDATE to the nullable side
--   (menu_items) of that LEFT JOIN.
--
-- Fix:
--   Keep the order row locked (already done), and read order_items
--   without FOR UPDATE. The finalize operation is serialized by
--   locking the parent order, so the item snapshot does not need
--   an outer-join FOR UPDATE.
-- ============================================================

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

  -- Lock the parent order. This serializes finalize attempts for
  -- the same order and prevents double billing.
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
  --
  -- IMPORTANT:
  -- Do NOT use FOR UPDATE on this LEFT JOIN.
  -- PostgreSQL rejects FOR UPDATE when the nullable side of an
  -- outer join is included.
  --
  -- The parent order is already locked above, so concurrent
  -- finalize operations for this order are serialized.
  FOR v_item IN
    SELECT
      oi.id,
      oi.item_id,
      oi.quantity,
      oi.unit_price,
      oi.item_name,
      mi.name AS menu_name,
      mi.price AS menu_price
    FROM public.order_items oi
    LEFT JOIN public.menu_items mi
      ON mi.id = oi.item_id
    WHERE oi.order_id = v_order.id
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity < 1 THEN
      RAISE EXCEPTION 'Invalid order quantity';
    END IF;

    IF v_item.unit_price IS NULL THEN
      IF v_item.menu_price IS NULL THEN
        RAISE EXCEPTION 'Menu price missing for order item';
      END IF;

      UPDATE public.order_items
      SET
        item_name = COALESCE(item_name, v_item.menu_name),
        unit_price = v_item.menu_price,
        line_total = v_item.menu_price * v_item.quantity
      WHERE id = v_item.id;
    ELSE
      UPDATE public.order_items
      SET
        line_total = COALESCE(line_total, unit_price * quantity),
        item_name = COALESCE(item_name, v_item.menu_name)
      WHERE id = v_item.id;
    END IF;
  END LOOP;

  SELECT COALESCE(
    SUM(COALESCE(line_total, unit_price * quantity)),
    0
  )
  INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_order.id;

  -- Explicit offer if supplied and valid.
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

  -- Otherwise select the best currently applicable offer.
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
      v_discount := LEAST(
        v_subtotal,
        v_subtotal * LEAST(v_discount_value, 100) / 100
      );
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

  v_total := ROUND(
    GREATEST(v_subtotal - v_discount, 0) + v_tax,
    2
  );

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
  SET
    next_number = v_invoice_seq + 1,
    updated_at = now()
  WHERE restaurant_id = v_order.restaurant_id;

  v_invoice_no :=
    'INV-' ||
    to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') ||
    '-' ||
    lpad(v_invoice_seq::text, 6, '0');

  -- Consume mapped inventory exactly once.
  PERFORM public.stage3_consume_order_inventory(v_order.id);

  UPDATE public.orders
  SET
    subtotal = v_subtotal,
    discount_amount = v_discount,
    tax_amount = v_tax,
    total_amount = v_total,
    offer_id = CASE
      WHEN v_offer.id IS NULL THEN NULL
      ELSE v_offer.id
    END,
    invoice_no = COALESCE(invoice_no, v_invoice_no),
    payment_status = v_payment_status,
    payment_method =
      NULLIF(
        left(
          lower(trim(COALESCE(p_payment_method, 'cash'))),
          30
        ),
        ''
      ),
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
  )
  VALUES (
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
