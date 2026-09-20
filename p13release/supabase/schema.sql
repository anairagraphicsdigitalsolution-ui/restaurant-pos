


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.is_super_admin()
    OR (
      public.current_user_role() = 'admin'
      AND public.current_restaurant_id() = p_restaurant_id
    );
$$;


ALTER FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text" DEFAULT NULL::"text", "p_offer_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text", "p_offer_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_restaurant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.restaurant_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."current_restaurant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrease_inventory"("item_id" "uuid", "qty" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_restaurant_id uuid;
BEGIN
  IF qty IS NULL OR qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT restaurant_id
    INTO v_restaurant_id
  FROM public.inventory
  WHERE id = item_id
  FOR UPDATE;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  IF NOT public.is_restaurant_member(v_restaurant_id) THEN
    RAISE EXCEPTION 'Not authorized for this restaurant';
  END IF;

  UPDATE public.inventory
  SET quantity = quantity - qty
  WHERE id = item_id
    AND quantity >= qty;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient inventory';
  END IF;
END;
$$;


ALTER FUNCTION "public"."decrease_inventory"("item_id" "uuid", "qty" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'super_admin'), false);
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.is_super_admin()
    OR (
      p_restaurant_id IS NOT NULL
      AND public.current_restaurant_id() = p_restaurant_id
    );
$$;


ALTER FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff_or_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(public.current_user_role() IN ('staff', 'admin', 'super_admin'), false);
$$;


ALTER FUNCTION "public"."is_staff_or_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(public.current_user_role() = 'super_admin', false);
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_whatsapp_config"("p_restaurant_id" "uuid", "p_number" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into plugin_settings (restaurant_id, plugin_slug, config)
  values (
    p_restaurant_id,
    'whatsapp',
    jsonb_build_object('number', p_number)
  )
  on conflict (restaurant_id, plugin_slug)
  do update set config = jsonb_build_object('number', p_number);
end;
$$;


ALTER FUNCTION "public"."set_whatsapp_config"("p_restaurant_id" "uuid", "p_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_adjust_inventory"("p_inventory_id" "uuid", "p_delta" integer, "p_reason" "text" DEFAULT 'manual adjustment'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_profile record;
  v_inventory public.inventory%ROWTYPE;
  v_new_qty integer;
BEGIN
  SELECT * INTO v_profile
  FROM public.stage3_current_profile();

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


ALTER FUNCTION "public"."stage3_adjust_inventory"("p_inventory_id" "uuid", "p_delta" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_adjust_inventory"("p_actor_id" "uuid", "p_inventory_id" "uuid", "p_delta" integer, "p_reason" "text" DEFAULT 'manual adjustment'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_adjust_inventory"("p_actor_id" "uuid", "p_inventory_id" "uuid", "p_delta" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_consume_order_inventory"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_consume_order_inventory"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_consume_order_inventory"("p_actor_id" "uuid", "p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_consume_order_inventory"("p_actor_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_create_reservation"("p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text" DEFAULT NULL::"text", "p_guests" integer DEFAULT 1, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_profile record;
  v_restaurant_id uuid;
  v_id uuid;
BEGIN
  SELECT * INTO v_profile
  FROM public.stage3_current_profile();

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


ALTER FUNCTION "public"."stage3_create_reservation"("p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_create_reservation"("p_actor_id" "uuid", "p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text" DEFAULT NULL::"text", "p_guests" integer DEFAULT 1, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_create_reservation"("p_actor_id" "uuid", "p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_current_profile"() RETURNS TABLE("user_id" "uuid", "restaurant_id" "uuid", "role" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.restaurant_id, p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."stage3_current_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_delete_reservation"("p_actor_id" "uuid", "p_reservation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_delete_reservation"("p_actor_id" "uuid", "p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_finalize_order"("p_order_id" "uuid", "p_payment_method" "text" DEFAULT 'cash'::"text", "p_paid_amount" numeric DEFAULT 0, "p_offer_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_finalize_order"("p_order_id" "uuid", "p_payment_method" "text", "p_paid_amount" numeric, "p_offer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_finalize_order"("p_actor_id" "uuid", "p_order_id" "uuid", "p_payment_method" "text" DEFAULT 'cash'::"text", "p_paid_amount" numeric DEFAULT 0, "p_offer_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_finalize_order"("p_actor_id" "uuid", "p_order_id" "uuid", "p_payment_method" "text", "p_paid_amount" numeric, "p_offer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_profile_for_actor"("p_actor_id" "uuid") RETURNS TABLE("user_id" "uuid", "restaurant_id" "uuid", "role" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.restaurant_id, p.role
  FROM public.profiles p
  WHERE p.id = p_actor_id
  LIMIT 1;
$$;


ALTER FUNCTION "public"."stage3_profile_for_actor"("p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_update_order_status"("p_order_id" "uuid", "p_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_profile record;
  v_order public.orders%ROWTYPE;
  v_new_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  SELECT * INTO v_profile
  FROM public.stage3_current_profile();

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


ALTER FUNCTION "public"."stage3_update_order_status"("p_order_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_update_order_status"("p_actor_id" "uuid", "p_order_id" "uuid", "p_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_update_order_status"("p_actor_id" "uuid", "p_order_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_update_reservation"("p_actor_id" "uuid", "p_reservation_id" "uuid", "p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text" DEFAULT NULL::"text", "p_guests" integer DEFAULT 1, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_update_reservation"("p_actor_id" "uuid", "p_reservation_id" "uuid", "p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage3_update_reservation_status"("p_actor_id" "uuid", "p_reservation_id" "uuid", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."stage3_update_reservation_status"("p_actor_id" "uuid", "p_reservation_id" "uuid", "p_status" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid",
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "before_data" "jsonb",
    "after_data" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text",
    "quantity" integer,
    "unit" "text",
    "restaurant_id" "uuid",
    "category" "text",
    "supplier" "text",
    "min_stock" integer DEFAULT 5,
    "sku" "text",
    "cost_price" numeric DEFAULT 0,
    "expiry_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "inventory_id" "uuid" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "quantity_delta" integer NOT NULL,
    "quantity_after" integer NOT NULL,
    "reference_id" "uuid",
    "reason" "text",
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_sequences" (
    "restaurant_id" "uuid" NOT NULL,
    "next_number" bigint DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_ingredients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "menu_item_id" "uuid",
    "inventory_id" "uuid",
    "quantity_used" integer
);


ALTER TABLE "public"."item_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text",
    "price" integer,
    "category" "text",
    "restaurant_id" "uuid",
    "image" "text",
    "description" "text"
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text",
    "discount" integer,
    "description" "text",
    "valid_till" "date",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "restaurant_id" "uuid",
    "valid_from" "date" DEFAULT CURRENT_DATE,
    "active" boolean DEFAULT true,
    "min_order" numeric(12,2) DEFAULT 0,
    "discount_type" "text" DEFAULT 'percent'::"text"
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid",
    "item_id" "uuid",
    "quantity" integer,
    "cooking_request" "text",
    "item_name" "text",
    "unit_price" numeric(12,2),
    "line_total" numeric(12,2)
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "source_type" "text" DEFAULT 'table / room'::"text",
    "source_id" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "restaurant_id" "uuid",
    "source_label" "text",
    "overall_note" "text",
    "subtotal" numeric(12,2) DEFAULT 0,
    "discount_amount" numeric(12,2) DEFAULT 0,
    "tax_amount" numeric(12,2) DEFAULT 0,
    "total_amount" numeric(12,2) DEFAULT 0,
    "offer_id" "uuid",
    "invoice_no" "text",
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "payment_method" "text",
    "paid_amount" numeric(12,2) DEFAULT 0,
    "billed_at" timestamp with time zone,
    "inventory_consumed" boolean DEFAULT false,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text"
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plugin_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid",
    "plugin_slug" "text",
    "event" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."plugin_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plugin_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid",
    "plugin_code" "text",
    "config" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."plugin_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plugins" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "text" NOT NULL,
    "plugin_slug" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "code" "text"
);


ALTER TABLE "public"."plugins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "restaurant_id" "uuid",
    "role" "text",
    "email" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text",
    "phone" "text",
    "table_id" "uuid",
    "date" "date",
    "time" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "guests" integer DEFAULT 1,
    "duration" integer DEFAULT 60,
    "reservation_end" timestamp without time zone,
    "notes" "text",
    "restaurant_id" "uuid",
    "reservation_start_at" timestamp with time zone,
    "reservation_end_at" timestamp with time zone
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid",
    "image_url" "text",
    "sort_order" integer DEFAULT 4,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_plugins" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid",
    "plugin_slug" "text",
    "enabled" boolean DEFAULT true,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "plugin_code" "text"
);


ALTER TABLE "public"."restaurant_plugins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text",
    "logo" "text",
    "owner_id" "uuid",
    "gst_enabled" boolean DEFAULT true,
    "gst_rate" numeric DEFAULT 5,
    "slug" "text",
    "cover_image" "text",
    "opening_time" "text",
    "cuisine" "text",
    "description" "text",
    "address" "text",
    "gst" "text",
    "owner_name" "text",
    "phone" "text",
    "status" "text" DEFAULT 'active'::"text",
    "theme_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."restaurants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "room_number" smallint,
    "restaurant_id" "uuid"
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "gst_enabled" boolean DEFAULT true,
    "gst_rate" numeric DEFAULT 5,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "inventory_id" "uuid" NOT NULL,
    "item_name" "text" NOT NULL,
    "used_qty" numeric NOT NULL,
    "unit" "text",
    "reason" "text",
    "used_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stock_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "table_number" smallint,
    "restaurant_id" "uuid",
    "seats" integer DEFAULT 4
);


ALTER TABLE "public"."tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "role" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_sequences"
    ADD CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("restaurant_id");



ALTER TABLE ONLY "public"."item_ingredients"
    ADD CONSTRAINT "item_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plugin_logs"
    ADD CONSTRAINT "plugin_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plugin_settings"
    ADD CONSTRAINT "plugin_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plugins"
    ADD CONSTRAINT "plugins_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."plugins"
    ADD CONSTRAINT "plugins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_banners"
    ADD CONSTRAINT "restaurant_banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_plugins"
    ADD CONSTRAINT "restaurant_plugins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."stock_usage"
    ADD CONSTRAINT "stock_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plugins"
    ADD CONSTRAINT "unique_plugin_per_restaurant" UNIQUE ("restaurant_id", "plugin_slug");



ALTER TABLE ONLY "public"."plugin_settings"
    ADD CONSTRAINT "unique_plugin_setting" UNIQUE ("restaurant_id", "plugin_code");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "idx_audit_logs_restaurant_created" ON "public"."audit_logs" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_inventory_restaurant_id" ON "public"."inventory" USING "btree" ("restaurant_id");



CREATE INDEX "idx_inventory_tx_inventory_created" ON "public"."inventory_transactions" USING "btree" ("inventory_id", "created_at" DESC);



CREATE INDEX "idx_inventory_tx_restaurant_created" ON "public"."inventory_transactions" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_menu_items_restaurant_id" ON "public"."menu_items" USING "btree" ("restaurant_id");



CREATE INDEX "idx_offers_restaurant_active_dates" ON "public"."offers" USING "btree" ("restaurant_id", "active", "valid_from", "valid_till");



CREATE INDEX "idx_offers_restaurant_id" ON "public"."offers" USING "btree" ("restaurant_id");



CREATE INDEX "idx_order_items_item_id" ON "public"."order_items" USING "btree" ("item_id");



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_restaurant_created_at" ON "public"."orders" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_orders_restaurant_id" ON "public"."orders" USING "btree" ("restaurant_id");



CREATE INDEX "idx_orders_restaurant_invoice" ON "public"."orders" USING "btree" ("restaurant_id", "invoice_no");



CREATE INDEX "idx_orders_restaurant_status_created" ON "public"."orders" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_orders_source" ON "public"."orders" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_plugin_logs_restaurant_id" ON "public"."plugin_logs" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugin_restaurant" ON "public"."plugin_settings" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugin_settings_restaurant_id" ON "public"."plugin_settings" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugins_restaurant" ON "public"."plugins" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugins_slug" ON "public"."plugins" USING "btree" ("plugin_slug");



CREATE INDEX "idx_profiles_restaurant_id" ON "public"."profiles" USING "btree" ("restaurant_id");



CREATE INDEX "idx_reservations_restaurant_id" ON "public"."reservations" USING "btree" ("restaurant_id");



CREATE INDEX "idx_reservations_restaurant_table_time" ON "public"."reservations" USING "btree" ("restaurant_id", "table_id", "reservation_start_at", "reservation_end_at");



CREATE INDEX "idx_restaurant_banners_restaurant_id" ON "public"."restaurant_banners" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_plugins_restaurant_id" ON "public"."restaurant_plugins" USING "btree" ("restaurant_id");



CREATE INDEX "idx_rooms_restaurant_id" ON "public"."rooms" USING "btree" ("restaurant_id");



CREATE INDEX "idx_stock_usage_restaurant_id" ON "public"."stock_usage" USING "btree" ("restaurant_id");



CREATE INDEX "idx_tables_restaurant_id" ON "public"."tables" USING "btree" ("restaurant_id");



CREATE UNIQUE INDEX "uq_inventory_tx_order_usage" ON "public"."inventory_transactions" USING "btree" ("inventory_id", "reference_id", "transaction_type") WHERE ("reference_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_orders_restaurant_invoice" ON "public"."orders" USING "btree" ("restaurant_id", "invoice_no") WHERE ("invoice_no" IS NOT NULL);



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_usage"
    ADD CONSTRAINT "fk_inventory" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "fk_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_sequences"
    ADD CONSTRAINT "invoice_sequences_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_ingredients"
    ADD CONSTRAINT "item_ingredients_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id");



ALTER TABLE ONLY "public"."item_ingredients"
    ADD CONSTRAINT "item_ingredients_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_item_id_fkey1" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_banners"
    ADD CONSTRAINT "restaurant_banners_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_plugins"
    ADD CONSTRAINT "restaurant_plugins_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_read_restaurant" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'super_admin'::"text") OR (("p"."restaurant_id" = "audit_logs"."restaurant_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))))));



CREATE POLICY "banners_delete_admin" ON "public"."restaurant_banners" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "banners_insert_admin" ON "public"."restaurant_banners" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "banners_select_authenticated_own" ON "public"."restaurant_banners" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "banners_update_admin" ON "public"."restaurant_banners" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_delete_admin" ON "public"."inventory" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "inventory_insert_admin" ON "public"."inventory" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "inventory_select_own" ON "public"."inventory" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_transactions_read_restaurant" ON "public"."inventory_transactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'super_admin'::"text") OR (("p"."restaurant_id" = "inventory_transactions"."restaurant_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))))));



CREATE POLICY "inventory_update_admin" ON "public"."inventory" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."invoice_sequences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_sequences_no_client_access" ON "public"."invoice_sequences" TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."item_ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "item_ingredients_delete_admin" ON "public"."item_ingredients" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_ingredients"."menu_item_id") AND ("mi"."restaurant_id" = "public"."current_restaurant_id"()))))));



CREATE POLICY "item_ingredients_insert_admin" ON "public"."item_ingredients" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM ("public"."menu_items" "mi"
     JOIN "public"."inventory" "i" ON (("i"."id" = "item_ingredients"."inventory_id")))
  WHERE (("mi"."id" = "item_ingredients"."menu_item_id") AND ("mi"."restaurant_id" = "public"."current_restaurant_id"()) AND ("i"."restaurant_id" = "public"."current_restaurant_id"()))))));



CREATE POLICY "item_ingredients_select_own" ON "public"."item_ingredients" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_ingredients"."menu_item_id") AND ("mi"."restaurant_id" = "public"."current_restaurant_id"()))))));



CREATE POLICY "item_ingredients_update_admin" ON "public"."item_ingredients" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_ingredients"."menu_item_id") AND ("mi"."restaurant_id" = "public"."current_restaurant_id"())))))) WITH CHECK (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM ("public"."menu_items" "mi"
     JOIN "public"."inventory" "i" ON (("i"."id" = "item_ingredients"."inventory_id")))
  WHERE (("mi"."id" = "item_ingredients"."menu_item_id") AND ("mi"."restaurant_id" = "public"."current_restaurant_id"()) AND ("i"."restaurant_id" = "public"."current_restaurant_id"()))))));



ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items_delete_admin" ON "public"."menu_items" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "menu_items_insert_admin" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "menu_items_select_authenticated_own" ON "public"."menu_items" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "menu_items_update_admin" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offers_delete_admin" ON "public"."offers" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "offers_insert_admin" ON "public"."offers" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "offers_select_authenticated_own" ON "public"."offers" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "offers_update_admin" ON "public"."offers" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_delete_admin" ON "public"."order_items" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"(( SELECT "o"."restaurant_id"
   FROM "public"."orders" "o"
  WHERE ("o"."id" = "order_items"."order_id"))));



CREATE POLICY "order_items_insert_staff_admin" ON "public"."order_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff_or_admin"() AND (EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."menu_items" "mi" ON ((("mi"."id" = "order_items"."item_id") AND ("mi"."restaurant_id" = "o"."restaurant_id"))))
  WHERE (("o"."id" = "order_items"."order_id") AND ("public"."is_super_admin"() OR ("o"."restaurant_id" = "public"."current_restaurant_id"())))))));



CREATE POLICY "order_items_select_staff_admin" ON "public"."order_items" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_staff_or_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."restaurant_id" = "public"."current_restaurant_id"())))))));



CREATE POLICY "order_items_update_staff_admin" ON "public"."order_items" FOR UPDATE TO "authenticated" USING (("public"."is_staff_or_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("public"."is_super_admin"() OR ("o"."restaurant_id" = "public"."current_restaurant_id"()))))))) WITH CHECK (("public"."is_staff_or_admin"() AND (EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."menu_items" "mi" ON ((("mi"."id" = "order_items"."item_id") AND ("mi"."restaurant_id" = "o"."restaurant_id"))))
  WHERE (("o"."id" = "order_items"."order_id") AND ("public"."is_super_admin"() OR ("o"."restaurant_id" = "public"."current_restaurant_id"())))))));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_delete_admin" ON "public"."orders" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "orders_insert_staff_admin" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "orders_select_staff_admin" ON "public"."orders" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR (("public"."current_user_role"() = ANY (ARRAY['staff'::"text", 'admin'::"text"])) AND ("restaurant_id" = "public"."current_restaurant_id"()))));



CREATE POLICY "orders_update_staff_admin" ON "public"."orders" FOR UPDATE TO "authenticated" USING (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id"))) WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



ALTER TABLE "public"."plugin_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plugin_logs_select_own" ON "public"."plugin_logs" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



ALTER TABLE "public"."plugin_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plugin_settings_manage_admin" ON "public"."plugin_settings" TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "plugin_settings_select_own" ON "public"."plugin_settings" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



ALTER TABLE "public"."plugins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plugins_manage_admin" ON "public"."plugins" TO "authenticated" USING ("public"."can_manage_restaurant"(
CASE
    WHEN ("restaurant_id" ~* '^[0-9a-f-]{36}$'::"text") THEN ("restaurant_id")::"uuid"
    ELSE NULL::"uuid"
END)) WITH CHECK ("public"."can_manage_restaurant"(
CASE
    WHEN ("restaurant_id" ~* '^[0-9a-f-]{36}$'::"text") THEN ("restaurant_id")::"uuid"
    ELSE NULL::"uuid"
END));



CREATE POLICY "plugins_select_own" ON "public"."plugins" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = ("public"."current_restaurant_id"())::"text")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_superadmin" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "profiles_insert_superadmin" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "profiles_select_self_or_superadmin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "profiles_update_superadmin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reservations_delete_admin" ON "public"."reservations" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "reservations_insert_staff_admin" ON "public"."reservations" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "reservations_select_own" ON "public"."reservations" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "reservations_update_staff_admin" ON "public"."reservations" FOR UPDATE TO "authenticated" USING (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id"))) WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



ALTER TABLE "public"."restaurant_banners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_plugins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restaurant_plugins_manage_admin" ON "public"."restaurant_plugins" TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "restaurant_plugins_select_own" ON "public"."restaurant_plugins" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restaurants_delete_superadmin" ON "public"."restaurants" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "restaurants_insert_superadmin" ON "public"."restaurants" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "restaurants_select_authenticated_own" ON "public"."restaurants" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("id" = "public"."current_restaurant_id"())));



CREATE POLICY "restaurants_update_owner_or_superadmin" ON "public"."restaurants" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR (("public"."current_user_role"() = 'admin'::"text") AND ("owner_id" = "auth"."uid"()) AND ("id" = "public"."current_restaurant_id"())))) WITH CHECK (("public"."is_super_admin"() OR (("public"."current_user_role"() = 'admin'::"text") AND ("owner_id" = "auth"."uid"()) AND ("id" = "public"."current_restaurant_id"()))));



ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rooms_delete_admin" ON "public"."rooms" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "rooms_insert_admin" ON "public"."rooms" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "rooms_select_authenticated_own" ON "public"."rooms" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "rooms_update_admin" ON "public"."rooms" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settings_delete_self" ON "public"."settings" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "settings_insert_self" ON "public"."settings" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "settings_select_self" ON "public"."settings" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "settings_update_self" ON "public"."settings" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



ALTER TABLE "public"."stock_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_usage_delete_admin" ON "public"."stock_usage" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "stock_usage_insert_staff_admin" ON "public"."stock_usage" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "stock_usage_select_own" ON "public"."stock_usage" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "stock_usage_update_admin" ON "public"."stock_usage" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tables_delete_admin" ON "public"."tables" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "tables_insert_admin" ON "public"."tables" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "tables_select_authenticated_own" ON "public"."tables" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "tables_update_admin" ON "public"."tables" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_manage_superadmin" ON "public"."users" TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "users_select_self_or_superadmin" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_super_admin"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text", "p_offer_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text", "p_offer_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text", "p_offer_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_restaurant_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_restaurant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_restaurant_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrease_inventory"("item_id" "uuid", "qty" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_staff_or_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_staff_or_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff_or_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_whatsapp_config"("p_restaurant_id" "uuid", "p_number" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_adjust_inventory"("p_inventory_id" "uuid", "p_delta" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_adjust_inventory"("p_inventory_id" "uuid", "p_delta" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage3_adjust_inventory"("p_inventory_id" "uuid", "p_delta" integer, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_adjust_inventory"("p_actor_id" "uuid", "p_inventory_id" "uuid", "p_delta" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_adjust_inventory"("p_actor_id" "uuid", "p_inventory_id" "uuid", "p_delta" integer, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_consume_order_inventory"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_consume_order_inventory"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage3_consume_order_inventory"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_consume_order_inventory"("p_actor_id" "uuid", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_consume_order_inventory"("p_actor_id" "uuid", "p_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."stage3_consume_order_inventory"("p_actor_id" "uuid", "p_order_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."stage3_create_reservation"("p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_create_reservation"("p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage3_create_reservation"("p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_create_reservation"("p_actor_id" "uuid", "p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_create_reservation"("p_actor_id" "uuid", "p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_current_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_current_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage3_current_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_delete_reservation"("p_actor_id" "uuid", "p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_delete_reservation"("p_actor_id" "uuid", "p_reservation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_finalize_order"("p_order_id" "uuid", "p_payment_method" "text", "p_paid_amount" numeric, "p_offer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_finalize_order"("p_order_id" "uuid", "p_payment_method" "text", "p_paid_amount" numeric, "p_offer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage3_finalize_order"("p_order_id" "uuid", "p_payment_method" "text", "p_paid_amount" numeric, "p_offer_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_finalize_order"("p_actor_id" "uuid", "p_order_id" "uuid", "p_payment_method" "text", "p_paid_amount" numeric, "p_offer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_finalize_order"("p_actor_id" "uuid", "p_order_id" "uuid", "p_payment_method" "text", "p_paid_amount" numeric, "p_offer_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."stage3_finalize_order"("p_actor_id" "uuid", "p_order_id" "uuid", "p_payment_method" "text", "p_paid_amount" numeric, "p_offer_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."stage3_profile_for_actor"("p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_profile_for_actor"("p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_update_order_status"("p_order_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_update_order_status"("p_order_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage3_update_order_status"("p_order_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_update_order_status"("p_actor_id" "uuid", "p_order_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_update_order_status"("p_actor_id" "uuid", "p_order_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_update_reservation"("p_actor_id" "uuid", "p_reservation_id" "uuid", "p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_update_reservation"("p_actor_id" "uuid", "p_reservation_id" "uuid", "p_table_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_name" "text", "p_phone" "text", "p_guests" integer, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage3_update_reservation_status"("p_actor_id" "uuid", "p_reservation_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage3_update_reservation_status"("p_actor_id" "uuid", "p_reservation_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."audit_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_transactions" TO "service_role";
GRANT SELECT ON TABLE "public"."inventory_transactions" TO "authenticated";



GRANT ALL ON TABLE "public"."invoice_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."item_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."item_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."plugin_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."plugin_logs" TO "service_role";



GRANT ALL ON TABLE "public"."plugin_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."plugin_settings" TO "service_role";



GRANT ALL ON TABLE "public"."plugins" TO "authenticated";
GRANT ALL ON TABLE "public"."plugins" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_banners" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_plugins" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_plugins" TO "service_role";



GRANT ALL ON TABLE "public"."restaurants" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurants" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."stock_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_usage" TO "service_role";



GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";









-- Security Advisor hardening (applied by migration 20260825210000)
-- Security Advisor hardening
-- Fixes public plugin catalog exposure and makes the analytics view obey
-- the caller's RLS policies on public.order_payments.

-- 1) plugin_catalog is global metadata, but it should not be writable by
-- arbitrary clients. Authenticated users may read it; only Super Admin may mutate it.
alter table public.plugin_catalog enable row level security;

drop policy if exists plugin_catalog_read_authenticated on public.plugin_catalog;
create policy plugin_catalog_read_authenticated
on public.plugin_catalog
for select
to authenticated
using (true);

drop policy if exists plugin_catalog_super_admin_insert on public.plugin_catalog;
create policy plugin_catalog_super_admin_insert
on public.plugin_catalog
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists plugin_catalog_super_admin_update on public.plugin_catalog;
create policy plugin_catalog_super_admin_update
on public.plugin_catalog
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists plugin_catalog_super_admin_delete on public.plugin_catalog;
create policy plugin_catalog_super_admin_delete
on public.plugin_catalog
for delete
to authenticated
using (public.is_super_admin());

-- 2) The daily payment summary is an analytics view over order_payments.
-- Make it SECURITY INVOKER so the caller's permissions/RLS on the base table
-- are respected instead of the view owner's privileges.
alter view public.restaurant_daily_payment_summary
set (security_invoker = true);

-- The app's server/API routes use the service role where appropriate.
-- Direct browser access is limited to authenticated users.
revoke all on public.restaurant_daily_payment_summary from anon;
grant select on public.restaurant_daily_payment_summary to authenticated;
