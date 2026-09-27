BEGIN;

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_payments_select_staff_admin ON public.order_payments;
CREATE POLICY order_payments_select_staff_admin
ON public.order_payments FOR SELECT TO authenticated
USING (public.is_super_admin() OR (public.is_staff_or_admin() AND public.is_restaurant_member(restaurant_id)));

DROP POLICY IF EXISTS order_payments_insert_staff_admin ON public.order_payments;
CREATE POLICY order_payments_insert_staff_admin
ON public.order_payments FOR INSERT TO authenticated
WITH CHECK (public.is_staff_or_admin() AND public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS order_payments_update_staff_admin ON public.order_payments;
CREATE POLICY order_payments_update_staff_admin
ON public.order_payments FOR UPDATE TO authenticated
USING (public.is_staff_or_admin() AND public.is_restaurant_member(restaurant_id))
WITH CHECK (public.is_staff_or_admin() AND public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS order_payments_delete_admin ON public.order_payments;
CREATE POLICY order_payments_delete_admin
ON public.order_payments FOR DELETE TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

DROP POLICY IF EXISTS order_refunds_select_staff_admin ON public.order_refunds;
CREATE POLICY order_refunds_select_staff_admin
ON public.order_refunds FOR SELECT TO authenticated
USING (public.is_super_admin() OR (public.is_staff_or_admin() AND public.is_restaurant_member(restaurant_id)));

DROP POLICY IF EXISTS order_refunds_insert_staff_admin ON public.order_refunds;
CREATE POLICY order_refunds_insert_staff_admin
ON public.order_refunds FOR INSERT TO authenticated
WITH CHECK (public.is_staff_or_admin() AND public.is_restaurant_member(restaurant_id));

-- Payment ledger is the single source of truth for collected money.
-- Any payment/refund change synchronizes orders.paid_amount/payment_status.
CREATE OR REPLACE FUNCTION public.sync_order_payment_totals(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_status text := 'unpaid';
  v_method text;
BEGIN
  SELECT COALESCE(total_amount,0) INTO v_total FROM public.orders WHERE id=p_order_id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.order_payments WHERE order_id=p_order_id AND status='paid';
  SELECT v_paid - COALESCE((SELECT SUM(amount) FROM public.order_refunds WHERE order_id=p_order_id AND status='refunded'),0) INTO v_paid;
  v_paid := GREATEST(LEAST(v_paid,v_total),0);

  SELECT payment_method INTO v_method
  FROM public.order_payments
  WHERE order_id=p_order_id AND status='paid'
  ORDER BY paid_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_total > 0 AND v_paid >= v_total THEN v_status := 'paid';
  ELSIF v_paid > 0 THEN v_status := 'partially_paid';
  END IF;

  UPDATE public.orders
  SET paid_amount=v_paid, payment_status=v_status, payment_method=COALESCE(v_method,payment_method)
  WHERE id=p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_order_payment_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_order_payment_totals(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_sync_order_payment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_order_payment_totals(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM public.sync_order_payment_totals(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_payments_sync_totals ON public.order_payments;
CREATE TRIGGER trg_order_payments_sync_totals
AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_order_payment_totals();

DROP TRIGGER IF EXISTS trg_order_refunds_sync_totals ON public.order_refunds;
CREATE TRIGGER trg_order_refunds_sync_totals
AFTER INSERT OR UPDATE OR DELETE ON public.order_refunds
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_order_payment_totals();

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

  IF COALESCE(v_restaurant.gst_enabled, true) THEN
    v_tax := ROUND(
      GREATEST(v_subtotal - v_discount, 0)
      * GREATEST(COALESCE(v_restaurant.gst_rate, 0), 0)
      / 100,
      2
    );
  END IF;

  v_total := ROUND(GREATEST(v_subtotal - v_discount, 0) + v_tax, 2);

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
    'total', v_total,
    'paid_amount', v_paid,
    'payment_received', v_payment_received,
    'payment_status', v_payment_status,
    'payment_method', p_payment_method,
    'offer_id', v_offer.id
  );
END;
$function$;




-- Preserve legacy paid amounts that were stored only on orders before the
-- payment ledger became authoritative.
INSERT INTO public.order_payments (restaurant_id, order_id, payment_method, amount, reference, status, paid_at, notes)
SELECT o.restaurant_id, o.id, COALESCE(o.payment_method,'cash'), GREATEST(COALESCE(o.paid_amount,0),0),
       'legacy-order-payment', 'paid', COALESCE(o.billed_at,o.created_at), 'Backfilled from legacy orders.paid_amount'
FROM public.orders o
WHERE COALESCE(o.paid_amount,0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.order_payments p WHERE p.order_id=o.id);

-- Recompute every affected order from payments/refunds.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT order_id FROM public.order_payments
  UNION
  SELECT DISTINCT order_id FROM public.order_refunds
  LOOP
    PERFORM public.sync_order_payment_totals(r.order_id);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_payments_restaurant_status_created
  ON public.order_payments(restaurant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_payments_order_status_created
  ON public.order_payments(order_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_refunds_order_status
  ON public.order_refunds(order_id,status);

COMMIT;
