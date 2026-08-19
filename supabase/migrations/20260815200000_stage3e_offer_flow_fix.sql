BEGIN;

-- ============================================================
-- STAGE 3E: COMPLETE OFFER FLOW
-- QR context -> Cart -> Place Order -> Billing
-- Server is authoritative for offer eligibility and discount.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_qr_context(
  p_slug text,
  p_type text,
  p_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant public.restaurants%ROWTYPE;
  v_source_id uuid;
  v_source_label text;
  v_type text := lower(trim(coalesce(p_type, '')));
  v_result jsonb;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) < 1 OR length(trim(p_slug)) > 120 THEN
    RAISE EXCEPTION 'Invalid restaurant';
  END IF;

  IF v_type NOT IN ('table', 'room') THEN
    RAISE EXCEPTION 'Invalid QR type';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  IF v_type = 'table' THEN
    SELECT t.id, format('Table %s', t.table_number)
      INTO v_source_id, v_source_label
    FROM public.tables t
    WHERE t.restaurant_id = v_restaurant.id
      AND (t.id::text = trim(p_id) OR t.table_number::text = trim(p_id))
    ORDER BY CASE WHEN t.id::text = trim(p_id) THEN 0 ELSE 1 END
    LIMIT 1;
  ELSE
    SELECT r.id, format('Room %s', r.room_number)
      INTO v_source_id, v_source_label
    FROM public.rooms r
    WHERE r.restaurant_id = v_restaurant.id
      AND (r.id::text = trim(p_id) OR r.room_number::text = trim(p_id))
    ORDER BY CASE WHEN r.id::text = trim(p_id) THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'QR source not found';
  END IF;

  SELECT jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', v_restaurant.id,
      'name', v_restaurant.name,
      'logo', v_restaurant.logo,
      'cover_image', v_restaurant.cover_image,
      'opening_time', v_restaurant.opening_time,
      'cuisine', v_restaurant.cuisine,
      'description', v_restaurant.description,
      'gst_enabled', v_restaurant.gst_enabled,
      'gst_rate', v_restaurant.gst_rate
    ),
    'source', jsonb_build_object(
      'id', v_source_id,
      'type', v_type,
      'label', v_source_label
    ),
    'menu', COALESCE((
      SELECT jsonb_agg(to_jsonb(mi) ORDER BY mi.category NULLS LAST, mi.name)
      FROM public.menu_items mi
      WHERE mi.restaurant_id = v_restaurant.id
    ), '[]'::jsonb),
    'offers', COALESCE((
      SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC)
      FROM public.offers o
      WHERE o.restaurant_id = v_restaurant.id
        AND COALESCE(o.active, true)
        AND (o.valid_from IS NULL OR o.valid_from <= CURRENT_DATE)
        AND (o.valid_till IS NULL OR o.valid_till >= CURRENT_DATE)
    ), '[]'::jsonb),
    'banners', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.sort_order, b.created_at)
      FROM public.restaurant_banners b
      WHERE b.restaurant_id = v_restaurant.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.create_public_qr_order(
  text, text, uuid, jsonb, text
);

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
      AND COALESCE(active, true)
      AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
      AND (valid_till IS NULL OR valid_till >= CURRENT_DATE)
      AND COALESCE(min_order, 0) <= v_subtotal;
  END IF;

  IF v_offer.id IS NULL THEN
    SELECT *
      INTO v_offer
    FROM public.offers
    WHERE restaurant_id = v_restaurant.id
      AND COALESCE(active, true)
      AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
      AND (valid_till IS NULL OR valid_till >= CURRENT_DATE)
      AND COALESCE(min_order, 0) <= v_subtotal
    ORDER BY
      CASE
        WHEN lower(COALESCE(discount_type, 'percent')) = 'flat'
          THEN LEAST(v_subtotal, GREATEST(COALESCE(discount, 0), 0))
        ELSE LEAST(
          v_subtotal,
          v_subtotal * LEAST(GREATEST(COALESCE(discount, 0), 0), 100) / 100
        )
      END DESC,
      created_at DESC
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

REVOKE ALL ON FUNCTION public.create_public_qr_order(
  text, text, uuid, jsonb, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_public_qr_order(
  text, text, uuid, jsonb, text, text
) TO service_role;

COMMIT;
