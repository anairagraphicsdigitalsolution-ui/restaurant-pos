-- Fix PostgreSQL 42P13: parameters after a DEFAULT must also have defaults.
-- This migration replaces the website-order function with a valid signature.
CREATE OR REPLACE FUNCTION public.create_public_website_order(
  p_slug text,
  p_type text DEFAULT 'website',
  p_source_id uuid DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
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
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) < 1 OR length(trim(p_slug)) > 120 THEN
    RAISE EXCEPTION 'Invalid restaurant';
  END IF;

  IF lower(trim(coalesce(p_type, ''))) <> 'website' THEN
    RAISE EXCEPTION 'Invalid website order type';
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant source is required';
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

  IF p_source_id <> v_restaurant.id THEN
    RAISE EXCEPTION 'Website restaurant mapping is invalid';
  END IF;

  v_source_label := 'Website Order';

  IF NULLIF(trim(p_offer_id), '') IS NOT NULL THEN
    BEGIN
      v_requested_offer := trim(p_offer_id)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_requested_offer := NULL;
    END;
  END IF;

  INSERT INTO public.orders (
    restaurant_id, source_type, source_id, source_label, status, overall_note
  ) VALUES (
    v_restaurant.id, lower(trim(p_type)), p_source_id::text, v_source_label,
    'pending', NULLIF(left(coalesce(p_overall_note, ''), 1000), '')
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
      order_id, item_id, quantity, cooking_request, item_name, unit_price, line_total
    ) VALUES (
      v_order_id, v_item_id, v_qty, v_request, v_name, v_price, v_price * v_qty
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
    SELECT o.* INTO v_offer
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
      * GREATEST(COALESCE(v_restaurant.gst_rate, 0), 0) / 100, 2
    );
  END IF;

  v_total := ROUND(GREATEST(v_subtotal - v_discount, 0) + v_tax, 2);

  UPDATE public.orders
  SET subtotal = v_subtotal,
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
