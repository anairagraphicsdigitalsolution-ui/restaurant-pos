BEGIN;

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
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', mi.id,
          'name', mi.name,
          'price', mi.price,
          'category', mi.category,
          'image', mi.image,
          'description', mi.description,
          'item_type', mi.item_type,
          'combo_config', mi.combo_config
        )
        ORDER BY mi.category NULLS LAST, mi.name
      )
      FROM public.menu_items mi
      WHERE mi.restaurant_id = v_restaurant.id
    ), '[]'::jsonb),
    'offers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'title', o.title,
          'discount', o.discount,
          'discount_type', o.discount_type,
          'min_order', o.min_order,
          'max_discount', o.max_discount,
          'target_type', o.target_type,
          'target_category', o.target_category,
          'usage_limit', o.usage_limit,
          'active', o.active,
          'valid_from', o.valid_from,
          'valid_till', o.valid_till,
          'created_at', o.created_at
        )
        ORDER BY o.created_at DESC
      )
      FROM public.offers o
      WHERE o.restaurant_id = v_restaurant.id
        AND COALESCE(o.active, true)
        AND (o.valid_from IS NULL OR o.valid_from <= CURRENT_DATE)
        AND (o.valid_till IS NULL OR o.valid_till >= CURRENT_DATE)
    ), '[]'::jsonb),
    'banners', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'image_url', b.image_url,
          'sort_order', b.sort_order,
          'created_at', b.created_at
        )
        ORDER BY b.sort_order, b.created_at
      )
      FROM public.restaurant_banners b
      WHERE b.restaurant_id = v_restaurant.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMIT;
