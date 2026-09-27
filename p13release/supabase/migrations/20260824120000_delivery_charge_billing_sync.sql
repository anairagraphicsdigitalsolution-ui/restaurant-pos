-- Delivery charge billing sync.
-- Non-destructive: keeps all existing orders/data and adds a snapshot field.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_charge numeric(12,2) NOT NULL DEFAULT 0;

-- Backfill the snapshot from the latest delivery record where possible.
UPDATE public.orders o
SET delivery_charge = GREATEST(COALESCE(rd.delivery_charge, 0), 0)
FROM (
  SELECT DISTINCT ON (order_id)
    order_id,
    delivery_charge,
    created_at
  FROM public.restaurant_deliveries
  WHERE order_id IS NOT NULL
  ORDER BY order_id, created_at DESC NULLS LAST
) rd
WHERE rd.order_id = o.id
  AND COALESCE(o.delivery_charge, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_charge
  ON public.orders(restaurant_id, order_mode, delivery_charge);

-- Patch the final actor-aware billing function AFTER the column exists.
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
  v_payment_received numeric(12,2) := GREATEST(COALESCE(p_paid_amount, 0), 0);
  v_existing_paid numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_payment_status text;
  v_invoice_seq bigint;
  v_invoice_no text;
  v_discount_type text;
  v_discount_value numeric(12,2) := 0;
  v_delivery_charge numeric(12,2) := 0;
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

  -- Use the same authoritative offer engine as billing preview.
  IF p_offer_id IS NOT NULL THEN
    SELECT * INTO v_offer
    FROM public.offers
    WHERE id = p_offer_id
      AND restaurant_id = v_order.restaurant_id;
    IF v_offer.id IS NOT NULL THEN
      v_discount := public.calculate_offer_discount(v_offer.id, v_order.id, v_subtotal);
      IF v_discount <= 0 THEN
        v_offer := NULL;
        v_discount := 0;
      END IF;
    END IF;
  END IF;

  IF v_offer.id IS NULL THEN
    SELECT o.* INTO v_offer
    FROM public.offers o
    WHERE o.restaurant_id = v_order.restaurant_id
      AND public.calculate_offer_discount(o.id, v_order.id, v_subtotal) > 0
    ORDER BY
      CASE WHEN o.stacking = 'exclusive' THEN 0 ELSE 1 END,
      o.priority DESC,
      public.calculate_offer_discount(o.id, v_order.id, v_subtotal) DESC,
      o.created_at DESC
    LIMIT 1;
    IF v_offer.id IS NOT NULL THEN
      v_discount := public.calculate_offer_discount(v_offer.id, v_order.id, v_subtotal);
    END IF;
  END IF;

  -- Delivery charge is added after food discount/tax.
  -- Prefer the order snapshot; fall back to the delivery record for older orders.
  v_delivery_charge := GREATEST(COALESCE(v_order.delivery_charge, 0), 0);

  IF v_delivery_charge = 0 AND COALESCE(v_order.order_mode, v_order.source_type) = 'delivery' THEN
    SELECT GREATEST(COALESCE(rd.delivery_charge, 0), 0)
      INTO v_delivery_charge
    FROM public.restaurant_deliveries rd
    WHERE rd.order_id = v_order.id
    ORDER BY rd.created_at DESC NULLS LAST
    LIMIT 1;
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
    GREATEST(v_subtotal - v_discount, 0)
    + v_tax
    + v_delivery_charge,
    2
  );

  SELECT COALESCE(SUM(op.amount), 0)
    - COALESCE((
        SELECT SUM(r.amount)
        FROM public.order_refunds r
        WHERE r.order_id = v_order.id
          AND COALESCE(r.status, 'refunded') = 'refunded'
      ), 0)
    INTO v_existing_paid
  FROM public.order_payments op
  WHERE op.order_id = v_order.id
    AND op.status = 'paid';

  v_existing_paid := GREATEST(v_existing_paid, 0);
  v_payment_received := LEAST(
    v_payment_received,
    GREATEST(v_total - v_existing_paid, 0)
  );
  v_paid := LEAST(v_total, v_existing_paid + v_payment_received);

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

  IF v_payment_received > 0 THEN
    INSERT INTO public.order_payments (
      restaurant_id, order_id, payment_method, amount, reference, status, paid_at, created_by, notes
    ) VALUES (
      v_order.restaurant_id,
      v_order.id,
      NULLIF(left(lower(trim(COALESCE(p_payment_method, 'cash'))), 30), ''),
      v_payment_received,
      NULL,
      'paid',
      now(),
      v_profile.user_id,
      'Recorded by billing finalize'
    );
  END IF;

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
    'delivery_charge', v_delivery_charge,
    'total', v_total,
    'paid_amount', v_paid,
    'payment_received', v_payment_received,
    'payment_status', v_payment_status,
    'payment_method', p_payment_method,
    'offer_id', v_offer.id
  );
END;
$function$;
