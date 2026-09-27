


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






CREATE OR REPLACE FUNCTION "public"."decrease_inventory"("item_id" "uuid", "qty" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update inventory
  set quantity = quantity - qty
  where id = item_id;
end;
$$;
DO $$ BEGIN IF to_regprocedure('public.decrease_inventory(uuid, integer)') IS NOT NULL THEN EXECUTE 'ALTER FUNCTION public.decrease_inventory(uuid, integer) OWNER TO postgres'; END IF; END $$;
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
DO $$ BEGIN IF to_regprocedure('public.set_whatsapp_config(uuid, text)') IS NOT NULL THEN EXECUTE 'ALTER FUNCTION public.set_whatsapp_config(uuid, text) OWNER TO postgres'; END IF; END $$;
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
    "cooking_request" "text"
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



CREATE INDEX "idx_plugin_restaurant" ON "public"."plugin_settings" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugins_restaurant" ON "public"."plugins" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugins_slug" ON "public"."plugins" USING "btree" ("plugin_slug");



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



CREATE POLICY "Allow all" ON "public"."plugin_settings" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all for now" ON "public"."plugins" USING (true);



CREATE POLICY "Public can view menu" ON "public"."menu_items" FOR SELECT USING (true);



CREATE POLICY "Public can view restaurants" ON "public"."restaurants" FOR SELECT USING (true);



CREATE POLICY "Public can view rooms" ON "public"."rooms" FOR SELECT USING (true);



CREATE POLICY "Public can view tables" ON "public"."tables" FOR SELECT USING (true);



CREATE POLICY "User based access" ON "public"."plugins" USING ((("auth"."uid"())::"text" = "restaurant_id"));



CREATE POLICY "allow" ON "public"."profiles" USING (true) WITH CHECK (true);



CREATE POLICY "anon_insert_items" ON "public"."order_items" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_insert_orders" ON "public"."orders" FOR INSERT TO "anon" WITH CHECK (("restaurant_id" IN ( SELECT "restaurants"."id"
   FROM "public"."restaurants")));



CREATE POLICY "auth_delete_items" ON "public"."order_items" FOR DELETE TO "authenticated" USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."restaurant_id" IN ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "auth_delete_orders" ON "public"."orders" FOR DELETE TO "authenticated" USING (("restaurant_id" IN ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "auth_insert_items" ON "public"."order_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "auth_insert_orders" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK (("restaurant_id" IN ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "auth_select_items" ON "public"."order_items" FOR SELECT TO "authenticated" USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."restaurant_id" IN ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "auth_select_orders" ON "public"."orders" FOR SELECT TO "authenticated" USING (("restaurant_id" IN ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "delete_menu_items" ON "public"."menu_items" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "insert_menu_items" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "inventory access" ON "public"."inventory" USING ((("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = 'super_admin'::"text"))) OR ("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



ALTER TABLE "public"."item_ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu access" ON "public"."menu_items" USING ((("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = 'super_admin'::"text"))) OR ("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "offers access" ON "public"."offers" USING ((("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = 'super_admin'::"text"))) OR ("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "open_items_all" ON "public"."order_items" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "open_orders_all" ON "public"."orders" TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plugins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public menu" ON "public"."menu_items" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."menu_items" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."restaurants" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."tables" FOR SELECT USING (true);



CREATE POLICY "public read menu" ON "public"."menu_items" FOR SELECT USING (true);



CREATE POLICY "public read restaurants" ON "public"."restaurants" FOR SELECT USING (true);



CREATE POLICY "public read rooms" ON "public"."rooms" FOR SELECT USING (true);



CREATE POLICY "public read tables" ON "public"."tables" FOR SELECT USING (true);



ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restaurants access" ON "public"."restaurants" USING ((("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = 'super_admin'::"text"))) OR ("id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "rooms access" ON "public"."rooms" USING ((("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = 'super_admin'::"text"))) OR ("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "select_menu_items" ON "public"."menu_items" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tables access" ON "public"."tables" USING ((("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = 'super_admin'::"text"))) OR ("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "update_menu_items" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "user settings" ON "public"."settings" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN BEGIN ALTER PUBLICATION supabase_realtime OWNER TO postgres; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END IF; END $$;






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."decrease_inventory"("item_id" "uuid", "qty" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."decrease_inventory"("item_id" "uuid", "qty" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrease_inventory"("item_id" "uuid", "qty" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_whatsapp_config"("p_restaurant_id" "uuid", "p_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_whatsapp_config"("p_restaurant_id" "uuid", "p_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_whatsapp_config"("p_restaurant_id" "uuid", "p_number" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."item_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."item_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."item_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."offers" TO "anon";
GRANT ALL ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."plugin_logs" TO "anon";
GRANT ALL ON TABLE "public"."plugin_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."plugin_logs" TO "service_role";



GRANT ALL ON TABLE "public"."plugin_settings" TO "anon";
GRANT ALL ON TABLE "public"."plugin_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."plugin_settings" TO "service_role";



GRANT ALL ON TABLE "public"."plugins" TO "anon";
GRANT ALL ON TABLE "public"."plugins" TO "authenticated";
GRANT ALL ON TABLE "public"."plugins" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reservations" TO "anon";
GRANT ALL ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_banners" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_banners" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_plugins" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_plugins" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_plugins" TO "service_role";



GRANT ALL ON TABLE "public"."restaurants" TO "anon";
GRANT ALL ON TABLE "public"."restaurants" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurants" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "anon";
GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."stock_usage" TO "anon";
GRANT ALL ON TABLE "public"."stock_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_usage" TO "service_role";



GRANT ALL ON TABLE "public"."tables" TO "anon";
GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
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































