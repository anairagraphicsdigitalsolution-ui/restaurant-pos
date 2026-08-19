BEGIN;

-- Stage 2: move public QR reads and order creation behind server-side APIs.
-- Direct anon table access is removed. The Next.js API routes use service_role
-- and the RPCs below validate restaurant/source/item ownership server-side.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_name text,
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS line_total numeric(12,2);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created_at
  ON public.orders (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

-- Remove the temporary public QR policies and all anonymous table privileges.
DROP POLICY IF EXISTS restaurants_public_read ON public.restaurants;
DROP POLICY IF EXISTS menu_items_public_read ON public.menu_items;
DROP POLICY IF EXISTS offers_public_read ON public.offers;
DROP POLICY IF EXISTS restaurant_banners_public_read ON public.restaurant_banners;
DROP POLICY IF EXISTS tables_public_read ON public.tables;
DROP POLICY IF EXISTS rooms_public_read ON public.rooms;
DROP POLICY IF EXISTS orders_anon_insert_valid_qr ON public.orders;
DROP POLICY IF EXISTS order_items_anon_insert_valid_qr ON public.order_items;

REVOKE ALL ON TABLE
  public.restaurants,
  public.menu_items,
  public.offers,
  public.restaurant_banners,
  public.tables,
  public.rooms,
  public.orders,
  public.order_items
FROM anon;

-- Public context RPC: only the data needed to render a QR ordering page.
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

-- Server-only order RPC. It validates every item against the QR restaurant,
-- computes prices from the database, and writes the order + items atomically.
CREATE OR REPLACE FUNCTION public.create_public_qr_order(
  p_slug text,
  p_type text,
  p_source_id uuid,
  p_items jsonb,
  p_overall_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
  v_source_label text;
  v_order_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_request text;
  v_name text;
  v_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_count integer := 0;
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

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Invalid order items';
  END IF;

  SELECT id INTO v_restaurant_id
  FROM public.restaurants
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  IF lower(trim(p_type)) = 'table' THEN
    SELECT format('Table %s', table_number) INTO v_source_label
    FROM public.tables
    WHERE id = p_source_id AND restaurant_id = v_restaurant_id;
  ELSE
    SELECT format('Room %s', room_number) INTO v_source_label
    FROM public.rooms
    WHERE id = p_source_id AND restaurant_id = v_restaurant_id;
  END IF;

  IF v_source_label IS NULL THEN
    RAISE EXCEPTION 'QR source does not belong to restaurant';
  END IF;

  INSERT INTO public.orders (
    restaurant_id,
    source_type,
    source_id,
    source_label,
    status,
    overall_note
  ) VALUES (
    v_restaurant_id,
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
    v_item_id := NULLIF(v_item->>'item_id', '')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_request := NULLIF(left(coalesce(v_item->>'cooking_request', ''), 500), '');

    IF v_item_id IS NULL OR v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN
      RAISE EXCEPTION 'Invalid item at position %', v_count;
    END IF;

    SELECT mi.name, mi.price::numeric
      INTO v_name, v_price
    FROM public.menu_items mi
    WHERE mi.id = v_item_id
      AND mi.restaurant_id = v_restaurant_id
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

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'restaurant_id', v_restaurant_id,
    'source_type', lower(trim(p_type)),
    'source_id', p_source_id,
    'source_label', v_source_label,
    'subtotal', v_subtotal
  );
END;
$$;

-- Only the server's service role may execute the order RPC.
REVOKE ALL ON FUNCTION public.get_public_qr_context(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_qr_context(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_public_qr_order(text, text, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_public_qr_order(text, text, uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_public_qr_context(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_public_qr_order(text, text, uuid, jsonb, text) TO service_role;

-- The old WhatsApp config RPC must never be callable anonymously.
REVOKE EXECUTE ON FUNCTION public.set_whatsapp_config(uuid, text) FROM anon;

COMMIT;
