-- Advanced offer targeting: whole menu, category or individual products.
-- Includes optional caps/usage limits and a server-side discount calculator.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS target_category text,
  ADD COLUMN IF NOT EXISTS max_discount numeric(12,2),
  ADD COLUMN IF NOT EXISTS usage_limit integer,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.offer_products (
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, menu_item_id)
);

ALTER TABLE public.offer_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offer_products_public_read ON public.offer_products;
DROP POLICY IF EXISTS offer_products_select_authenticated_own ON public.offer_products;
DROP POLICY IF EXISTS offer_products_insert_admin ON public.offer_products;
DROP POLICY IF EXISTS offer_products_delete_admin ON public.offer_products;

CREATE POLICY offer_products_public_read
ON public.offer_products FOR SELECT TO anon USING (true);

CREATE POLICY offer_products_select_authenticated_own
ON public.offer_products FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.offers o
    WHERE o.id = offer_products.offer_id
      AND o.restaurant_id = public.current_restaurant_id()
  )
);

CREATE POLICY offer_products_insert_admin
ON public.offer_products FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.offers o
    WHERE o.id = offer_products.offer_id
      AND public.can_manage_restaurant(o.restaurant_id)
  )
  AND EXISTS (
    SELECT 1 FROM public.menu_items mi
    JOIN public.offers o ON o.restaurant_id = mi.restaurant_id
    WHERE mi.id = offer_products.menu_item_id
      AND o.id = offer_products.offer_id
  )
);

CREATE POLICY offer_products_delete_admin
ON public.offer_products FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.offers o
    WHERE o.id = offer_products.offer_id
      AND public.can_manage_restaurant(o.restaurant_id)
  )
);

GRANT SELECT ON public.offer_products TO anon, authenticated;
GRANT INSERT, DELETE ON public.offer_products TO authenticated;

CREATE INDEX IF NOT EXISTS idx_offer_products_menu_item
  ON public.offer_products (menu_item_id);

CREATE INDEX IF NOT EXISTS idx_offers_targeting
  ON public.offers (restaurant_id, target_type, active);

CREATE OR REPLACE FUNCTION public.calculate_offer_discount(
  p_offer_id uuid,
  p_order_id uuid,
  p_subtotal numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.offers%ROWTYPE;
  v_eligible numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_type text;
  v_value numeric(12,2);
  v_used integer := 0;
BEGIN
  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF COALESCE(v_offer.active, true) = false
     OR (v_offer.valid_from IS NOT NULL AND v_offer.valid_from > CURRENT_DATE)
     OR (v_offer.valid_till IS NOT NULL AND v_offer.valid_till < CURRENT_DATE)
     OR COALESCE(v_offer.min_order, 0) > COALESCE(p_subtotal, 0) THEN
    RETURN 0;
  END IF;

  IF v_offer.usage_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used
    FROM public.orders
    WHERE offer_id = v_offer.id
      AND COALESCE(status, '') <> 'cancelled';
    IF v_used >= v_offer.usage_limit THEN RETURN 0; END IF;
  END IF;

  IF COALESCE(v_offer.target_type, 'all') = 'products' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total, oi.unit_price * oi.quantity)), 0)
      INTO v_eligible
    FROM public.order_items oi
    JOIN public.offer_products op ON op.menu_item_id = oi.item_id
    WHERE oi.order_id = p_order_id
      AND op.offer_id = v_offer.id;
  ELSIF COALESCE(v_offer.target_type, 'all') = 'category' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total, oi.unit_price * oi.quantity)), 0)
      INTO v_eligible
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.item_id
    WHERE oi.order_id = p_order_id
      AND mi.category = v_offer.target_category;
  ELSE
    v_eligible := COALESCE(p_subtotal, 0);
  END IF;

  v_eligible := GREATEST(v_eligible, 0);
  IF v_eligible <= 0 THEN RETURN 0; END IF;

  v_type := lower(COALESCE(v_offer.discount_type, 'percent'));
  v_value := GREATEST(COALESCE(v_offer.discount, 0), 0);

  IF v_type = 'flat' THEN
    v_discount := LEAST(v_eligible, v_value);
  ELSE
    v_discount := LEAST(v_eligible, v_eligible * LEAST(v_value, 100) / 100);
  END IF;

  IF v_offer.max_discount IS NOT NULL THEN
    v_discount := LEAST(v_discount, GREATEST(v_offer.max_discount, 0));
  END IF;

  RETURN ROUND(GREATEST(v_discount, 0), 2);
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_offer_discount(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_offer_discount(uuid, uuid, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_public_qr_order(
  p_slug text,
  p_type text,
  p_source_id uuid,
  p_items jsonb,
  p_overall_note text DEFAULT NULL,
  p_offer_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant public.restaurants%ROWTYPE;
  v_source_label text;
  v_order_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_request text;
  v_name text;
  v_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_count integer := 0;
  v_offer public.offers%ROWTYPE;
  v_requested_offer uuid;
  v_discount_type text;
  v_discount_value numeric(12,2);
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) < 1 OR length(trim(p_slug)) > 120 THEN
    RAISE EXCEPTION 'Invalid restaurant';
  END IF;

  IF lower(trim(coalesce(p_type, ''))) NOT IN ('table', 'room') THEN
    RAISE EXCEPTION 'Invalid QR type';
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'QR source is required';
  END IF;

  IF jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1
     OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Invalid order items';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  IF lower(trim(p_type)) = 'table' THEN
    SELECT format('Table %s', table_number)
      INTO v_source_label
    FROM public.tables
    WHERE id = p_source_id
      AND restaurant_id = v_restaurant.id;
  ELSE
    SELECT format('Room %s', room_number)
      INTO v_source_label
    FROM public.rooms
    WHERE id = p_source_id
      AND restaurant_id = v_restaurant.id;
  END IF;

  IF v_source_label IS NULL THEN
    RAISE EXCEPTION 'QR source does not belong to restaurant';
  END IF;

  IF NULLIF(trim(p_offer_id), '') IS NOT NULL THEN
    BEGIN
      v_requested_offer := trim(p_offer_id)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_requested_offer := NULL;
    END;
  END IF;

  INSERT INTO public.orders (
    restaurant_id,
    source_type,
    source_id,
    source_label,
    status,
    overall_note
  ) VALUES (
    v_restaurant.id,
    lower(trim(p_type)),
    p_source_id::text,
    v_source_label,
    'pending',
    NULLIF(left(coalesce(p_overall_note, ''), 1000), '')
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_count := v_count + 1;

    BEGIN
      v_item_id := NULLIF(v_item->>'item_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid item at position %', v_count;
    END;

    v_qty := (v_item->>'quantity')::integer;
    v_request := NULLIF(left(coalesce(v_item->>'cooking_request', ''), 500), '');

    IF v_item_id IS NULL OR v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN
      RAISE EXCEPTION 'Invalid item at position %', v_count;
    END IF;

    SELECT mi.name, mi.price::numeric
      INTO v_name, v_price
    FROM public.menu_items mi
    WHERE mi.id = v_item_id
      AND mi.restaurant_id = v_restaurant.id
    LIMIT 1;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Menu item does not belong to restaurant';
    END IF;

    INSERT INTO public.order_items (
      order_id,
      item_id,
      quantity,
      cooking_request,
      item_name,
      unit_price,
      line_total
    ) VALUES (
      v_order_id,
      v_item_id,
      v_qty,
      v_request,
      v_name,
      v_price,
      v_price * v_qty
    );

    v_subtotal := v_subtotal + (v_price * v_qty);
  END LOOP;

  IF v_requested_offer IS NOT NULL THEN
    SELECT * INTO v_offer
    FROM public.offers
    WHERE id = v_requested_offer
      AND restaurant_id = v_restaurant.id
      AND public.calculate_offer_discount(id, v_order_id, v_subtotal) > 0;
  END IF;

  IF v_offer.id IS NULL THEN
    SELECT o.*
      INTO v_offer
    FROM public.offers o
    WHERE o.restaurant_id = v_restaurant.id
      AND public.calculate_offer_discount(o.id, v_order_id, v_subtotal) > 0
    ORDER BY public.calculate_offer_discount(o.id, v_order_id, v_subtotal) DESC, o.created_at DESC
    LIMIT 1;
  END IF;

  IF v_offer.id IS NOT NULL THEN
    v_discount := public.calculate_offer_discount(v_offer.id, v_order_id, v_subtotal);
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

  UPDATE public.orders
  SET
    subtotal = v_subtotal,
    discount_amount = v_discount,
    tax_amount = v_tax,
    total_amount = v_total,
    offer_id = v_offer.id
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'restaurant_id', v_restaurant.id,
    'source_type', lower(trim(p_type)),
    'source_id', p_source_id,
    'source_label', v_source_label,
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'tax_amount', v_tax,
    'total_amount', v_total,
    'offer_id', v_offer.id,
    'offer_title', v_offer.title
  );
END;
$$;


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
  -- active offer. Product/category targeting is resolved server-side.
  IF p_offer_id IS NOT NULL THEN
    SELECT * INTO v_offer
    FROM public.offers
    WHERE id = p_offer_id
      AND restaurant_id = v_order.restaurant_id
      AND public.calculate_offer_discount(id, v_order.id, v_subtotal) > 0;
  END IF;

  IF v_offer.id IS NULL THEN
    SELECT o.* INTO v_offer
    FROM public.offers o
    WHERE o.restaurant_id = v_order.restaurant_id
      AND public.calculate_offer_discount(o.id, v_order.id, v_subtotal) > 0
    ORDER BY public.calculate_offer_discount(o.id, v_order.id, v_subtotal) DESC, o.created_at DESC
    LIMIT 1;
  END IF;

  IF v_offer.id IS NOT NULL THEN
    v_discount := public.calculate_offer_discount(v_offer.id, v_order.id, v_subtotal);
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



REVOKE ALL ON FUNCTION public.create_public_qr_order(text, text, uuid, jsonb, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_public_qr_order(text, text, uuid, jsonb, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.stage3_finalize_order(uuid, uuid, text, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage3_finalize_order(uuid, uuid, text, numeric, uuid)
  TO authenticated, service_role;
