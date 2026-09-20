


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


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






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


CREATE OR REPLACE FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text") OWNER TO "postgres";


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
    "restaurant_id" "uuid"
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
    "overall_note" "text"
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
    "restaurant_id" "uuid"
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
    "description" "text"
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


ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "idx_inventory_restaurant_id" ON "public"."inventory" USING "btree" ("restaurant_id");



CREATE INDEX "idx_menu_items_restaurant_id" ON "public"."menu_items" USING "btree" ("restaurant_id");



CREATE INDEX "idx_offers_restaurant_id" ON "public"."offers" USING "btree" ("restaurant_id");



CREATE INDEX "idx_order_items_item_id" ON "public"."order_items" USING "btree" ("item_id");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_restaurant_created_at" ON "public"."orders" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_orders_restaurant_id" ON "public"."orders" USING "btree" ("restaurant_id");



CREATE INDEX "idx_orders_source" ON "public"."orders" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_plugin_logs_restaurant_id" ON "public"."plugin_logs" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugin_restaurant" ON "public"."plugin_settings" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugin_settings_restaurant_id" ON "public"."plugin_settings" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugins_restaurant" ON "public"."plugins" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugins_slug" ON "public"."plugins" USING "btree" ("plugin_slug");



CREATE INDEX "idx_profiles_restaurant_id" ON "public"."profiles" USING "btree" ("restaurant_id");



CREATE INDEX "idx_reservations_restaurant_id" ON "public"."reservations" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_banners_restaurant_id" ON "public"."restaurant_banners" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_plugins_restaurant_id" ON "public"."restaurant_plugins" USING "btree" ("restaurant_id");



CREATE INDEX "idx_rooms_restaurant_id" ON "public"."rooms" USING "btree" ("restaurant_id");



CREATE INDEX "idx_stock_usage_restaurant_id" ON "public"."stock_usage" USING "btree" ("restaurant_id");



CREATE INDEX "idx_tables_restaurant_id" ON "public"."tables" USING "btree" ("restaurant_id");



ALTER TABLE ONLY "public"."stock_usage"
    ADD CONSTRAINT "fk_inventory" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "fk_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



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



CREATE POLICY "banners_delete_admin" ON "public"."restaurant_banners" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "banners_insert_admin" ON "public"."restaurant_banners" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "banners_select_authenticated_own" ON "public"."restaurant_banners" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "banners_update_admin" ON "public"."restaurant_banners" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_delete_admin" ON "public"."inventory" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "inventory_insert_admin" ON "public"."inventory" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "inventory_select_own" ON "public"."inventory" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "inventory_update_admin" ON "public"."inventory" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



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





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_public_qr_order"("p_slug" "text", "p_type" "text", "p_source_id" "uuid", "p_items" "jsonb", "p_overall_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_restaurant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_restaurant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrease_inventory"("item_id" "uuid", "qty" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrease_inventory"("item_id" "uuid", "qty" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff_or_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff_or_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_whatsapp_config"("p_restaurant_id" "uuid", "p_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_whatsapp_config"("p_restaurant_id" "uuid", "p_number" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



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































