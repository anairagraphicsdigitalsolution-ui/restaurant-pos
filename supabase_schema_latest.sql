


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



CREATE OR REPLACE FUNCTION "public"."apply_discount_rule"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_rule_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order public.orders%rowtype;
  v_rule public.discount_rules%rowtype;
  v_discount numeric(12,2) := 0;
  v_subtotal numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
begin
  if not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_order from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if not found then raise exception 'Order not found'; end if;

  select * into v_rule from public.discount_rules
  where id=p_rule_id and restaurant_id=p_restaurant_id and active=true
    and (valid_from is null or valid_from <= current_date)
    and (valid_to is null or valid_to >= current_date);
  if not found then raise exception 'Discount rule is not active'; end if;

  v_subtotal := coalesce(v_order.subtotal, v_order.total_amount, 0);
  if v_subtotal < coalesce(v_rule.min_order,0) then
    raise exception 'Minimum order value not met';
  end if;

  if lower(v_rule.discount_type)='flat' then
    v_discount := least(v_subtotal, greatest(v_rule.value,0));
  else
    v_discount := least(
      v_subtotal,
      v_subtotal * least(greatest(v_rule.value,0),100) / 100
    );
  end if;

  if v_rule.max_discount is not null then
    v_discount := least(v_discount, greatest(v_rule.max_discount,0));
  end if;

  select round(
    greatest(v_subtotal-v_discount,0)
    * greatest(coalesce(r.gst_rate,0),0) / 100, 2
  ) into v_tax
  from public.restaurants r where r.id=p_restaurant_id;

  v_total := round(greatest(v_subtotal-v_discount,0)+v_tax,2);

  update public.orders
  set discount_amount=v_discount,tax_amount=v_tax,total_amount=v_total
  where id=p_order_id;

  insert into public.order_discount_applications(
    restaurant_id,order_id,discount_rule_id,discount_amount,approved_by,reason
  ) values (
    p_restaurant_id,p_order_id,p_rule_id,v_discount,auth.uid(),p_reason
  );

  insert into public.pos_audit_events(
    restaurant_id,actor_id,action,entity_type,entity_id,after_data,reason
  ) values (
    p_restaurant_id,auth.uid(),'discount.applied','order',p_order_id,
    jsonb_build_object('discount',v_discount,'total',v_total),p_reason
  );

  return jsonb_build_object(
    'order_id',p_order_id,
    'discount_amount',v_discount,
    'tax_amount',v_tax,
    'total_amount',v_total
  );
end;
$$;


ALTER FUNCTION "public"."apply_discount_rule"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_rule_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_recipe_stock_deduction"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_recipe public.restaurant_recipes%rowtype;
  v_recipe_item public.restaurant_recipe_items%rowtype;
  v_deduct numeric;
  v_new_qty numeric;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then return; end if;

  for v_item in
    select oi.item_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select * into v_recipe
    from public.restaurant_recipes
    where restaurant_id = v_order.restaurant_id
      and menu_item_id = v_item.item_id
    limit 1;

    if not found then continue; end if;

    for v_recipe_item in
      select *
      from public.restaurant_recipe_items
      where recipe_id = v_recipe.id
    loop
      if exists (
        select 1
        from public.inventory_transactions
        where restaurant_id = v_order.restaurant_id
          and inventory_id = v_recipe_item.inventory_id
          and reference_id = p_order_id
          and transaction_type = 'recipe_sale'
      ) then
        continue;
      end if;

      v_deduct := coalesce(v_recipe_item.quantity, 0) *
                  coalesce(v_item.quantity, 0) /
                  greatest(coalesce(v_recipe.yield_qty, 1), 1);

      if v_deduct <= 0 then continue; end if;

      update public.inventory
      set quantity = coalesce(quantity, 0) - v_deduct
      where id = v_recipe_item.inventory_id
        and restaurant_id = v_order.restaurant_id
      returning quantity into v_new_qty;

      if v_new_qty is null then continue; end if;

      insert into public.inventory_transactions(
        restaurant_id, inventory_id, transaction_type,
        quantity_delta, quantity_after, reference_id, reason, actor_id
      )
      values(
        v_order.restaurant_id,
        v_recipe_item.inventory_id,
        'recipe_sale',
        -v_deduct,
        v_new_qty,
        p_order_id,
        'Automatic recipe stock deduction',
        null
      );
    end loop;
  end loop;
end;
$$;


ALTER FUNCTION "public"."apply_recipe_stock_deduction"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_kot_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.kot_no is null then
    perform pg_advisory_xact_lock(hashtext('anaira-kot-' || new.restaurant_id::text));
    select coalesce(max(kot_no), 0) + 1
      into new.kot_no
    from public.kot_tickets
    where restaurant_id = new.restaurant_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."assign_kot_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_loyalty_for_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s public.loyalty_settings%ROWTYPE;
  c public.customers%ROWTYPE;
  base_points integer := 0;
  final_points integer := 0;
  v_multiplier numeric := 1;
  tier_record record;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF lower(coalesce(NEW.status, '')) IN ('cancelled', 'canceled') THEN
    RETURN NEW;
  END IF;

  IF NOT (
    lower(coalesce(NEW.payment_status, '')) = 'paid'
    OR lower(coalesce(NEW.status, '')) IN ('paid', 'completed', 'done', 'served')
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.seed_default_loyalty_config(NEW.restaurant_id);

  SELECT *
  INTO s
  FROM public.loyalty_settings AS ls
  WHERE ls.restaurant_id = NEW.restaurant_id;

  IF NOT coalesce(s.enabled, true) THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.total_amount, 0) < coalesce(s.min_bill_amount, 0) THEN
    RETURN NEW;
  END IF;

  -- Idempotency: never award the same order twice.
  IF EXISTS (
    SELECT 1
    FROM public.loyalty_transactions AS ltx
    WHERE ltx.order_id = NEW.id
      AND ltx.transaction_type = 'earn'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO c
  FROM public.customers AS cu
  WHERE cu.id = NEW.customer_id
    AND cu.restaurant_id = NEW.restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  base_points := floor(
    greatest(coalesce(NEW.total_amount, 0), 0)
    * coalesce(s.points_per_rupee, 0)
  )::integer;

  -- Explicit table alias fixes: column multiplier is no longer ambiguous.
  SELECT lt.multiplier
  INTO tier_record
  FROM public.loyalty_tiers AS lt
  WHERE lt.restaurant_id = NEW.restaurant_id
    AND lt.active = true
    AND lt.min_points <= coalesce(c.loyalty_points, 0)
  ORDER BY lt.min_points DESC
  LIMIT 1;

  v_multiplier := coalesce(tier_record.multiplier, 1);
  final_points := floor(base_points * v_multiplier)::integer;

  IF s.max_points_per_order IS NOT NULL THEN
    final_points := least(final_points, s.max_points_per_order);
  END IF;

  IF final_points <= 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.customers AS cu
  SET
    loyalty_points = coalesce(cu.loyalty_points, 0) + final_points,
    total_orders = coalesce(cu.total_orders, 0) + 1,
    total_spend = coalesce(cu.total_spend, 0) + coalesce(NEW.total_amount, 0),
    last_visit_at = coalesce(NEW.created_at, now()),
    updated_at = now()
  WHERE cu.id = c.id;

  INSERT INTO public.loyalty_transactions (
    restaurant_id,
    customer_id,
    order_id,
    points,
    transaction_type,
    note
  )
  VALUES (
    NEW.restaurant_id,
    NEW.customer_id,
    NEW.id,
    final_points,
    'earn',
    'Automatic order reward'
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."award_loyalty_for_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_delivery_settlement_difference"("p_expected_cash" numeric, "p_expected_upi" numeric, "p_expected_card" numeric, "p_submitted_cash" numeric, "p_submitted_upi" numeric, "p_submitted_card" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select round(
    coalesce(p_submitted_cash,0) + coalesce(p_submitted_upi,0) + coalesce(p_submitted_card,0)
    - coalesce(p_expected_cash,0) - coalesce(p_expected_upi,0) - coalesce(p_expected_card,0), 2
  );
$$;


ALTER FUNCTION "public"."calculate_delivery_settlement_difference"("p_expected_cash" numeric, "p_expected_upi" numeric, "p_expected_card" numeric, "p_submitted_cash" numeric, "p_submitted_upi" numeric, "p_submitted_card" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_food_cost"("p_restaurant_id" "uuid", "p_menu_item_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_recipe public.restaurant_recipes%rowtype;
  v_cost numeric := 0;
  v_price numeric := 0;
  v_row record;
begin
  select * into v_recipe
  from public.restaurant_recipes
  where restaurant_id = p_restaurant_id
    and menu_item_id = p_menu_item_id
  limit 1;

  select coalesce(price,0) into v_price
  from public.menu_items
  where id = p_menu_item_id
    and restaurant_id = p_restaurant_id;

  if not found then
    raise exception 'Menu item not found';
  end if;

  if found then
    for v_row in
      select ri.quantity, coalesce(i.cost_price,0) cost_price
      from public.restaurant_recipe_items ri
      join public.inventory i on i.id = ri.inventory_id
      where ri.recipe_id = v_recipe.id
    loop
      v_cost := v_cost + coalesce(v_row.quantity,0) * coalesce(v_row.cost_price,0);
    end loop;
  end if;

  return jsonb_build_object(
    'menu_item_id', p_menu_item_id,
    'recipe_cost', round(v_cost,2),
    'selling_price', round(v_price,2),
    'food_cost_percent',
      case when v_price > 0 then round((v_cost / v_price) * 100,2) else 0 end,
    'margin', round(v_price - v_cost,2)
  );
end;
$$;


ALTER FUNCTION "public"."calculate_food_cost"("p_restaurant_id" "uuid", "p_menu_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_offer_discount"("p_offer_id" "uuid", "p_order_id" "uuid", "p_subtotal" numeric) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_offer public.offers%ROWTYPE;
  v_eligible numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_type text;
  v_value numeric(12,2);
  v_used integer := 0;
  v_customer public.customers%ROWTYPE;
  v_tier_name text;
  v_now_local timestamp := now() AT TIME ZONE 'Asia/Kolkata';
  v_day integer := EXTRACT(ISODOW FROM v_now_local);
  v_days text;
  v_qty integer := 0;
  v_buy integer := 1;
  v_get integer := 1;
  v_free_price numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_offer
  FROM public.offers
  WHERE id = p_offer_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  IF COALESCE(v_offer.active,true)=false
     OR (v_offer.valid_from IS NOT NULL AND v_offer.valid_from>CURRENT_DATE)
     OR (v_offer.valid_till IS NOT NULL AND v_offer.valid_till<CURRENT_DATE)
     OR COALESCE(v_offer.min_order,0)>COALESCE(p_subtotal,0) THEN
    RETURN 0;
  END IF;

  v_days := NULLIF(TRIM(COALESCE(v_offer.days_of_week,'')),'');
  IF v_days IS NOT NULL
     AND POSITION(','||v_day::text||',' IN ','||v_days||',')=0 THEN
    RETURN 0;
  END IF;

  IF v_offer.start_time IS NOT NULL AND v_now_local::time<v_offer.start_time THEN RETURN 0; END IF;
  IF v_offer.end_time IS NOT NULL AND v_now_local::time>v_offer.end_time THEN RETURN 0; END IF;

  IF v_offer.usage_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used
    FROM public.orders
    WHERE offer_id=v_offer.id
      AND COALESCE(status,'')<>'cancelled';
    IF v_used>=v_offer.usage_limit THEN RETURN 0; END IF;
  END IF;

  IF COALESCE(v_offer.new_customer_only,false)
     OR NULLIF(TRIM(COALESCE(v_offer.customer_tier,'')),'') IS NOT NULL THEN
    SELECT c.* INTO v_customer
    FROM public.customers c
    JOIN public.orders o ON o.customer_id=c.id
    WHERE o.id=p_order_id
    LIMIT 1;

    IF v_customer.id IS NULL THEN RETURN 0; END IF;
    IF COALESCE(v_offer.new_customer_only,false)
       AND COALESCE(v_customer.total_orders,0)>0 THEN RETURN 0; END IF;

    IF NULLIF(TRIM(COALESCE(v_offer.customer_tier,'')),'') IS NOT NULL THEN
      SELECT t.name INTO v_tier_name
      FROM public.loyalty_tiers t
      WHERE t.restaurant_id=v_customer.restaurant_id
        AND t.active=true
        AND t.min_points<=COALESCE(v_customer.loyalty_points,0)
      ORDER BY t.min_points DESC
      LIMIT 1;

      IF lower(COALESCE(v_tier_name,''))<>lower(COALESCE(v_offer.customer_tier,'')) THEN
        RETURN 0;
      END IF;
    END IF;
  END IF;

  IF COALESCE(v_offer.target_type,'all')='products' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total,oi.unit_price*oi.quantity)),0)
    INTO v_eligible
    FROM public.order_items oi
    JOIN public.offer_products op ON op.menu_item_id=oi.item_id
    WHERE oi.order_id=p_order_id
      AND op.offer_id=v_offer.id;
  ELSIF COALESCE(v_offer.target_type,'all')='category' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total,oi.unit_price*oi.quantity)),0)
    INTO v_eligible
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id=oi.item_id
    WHERE oi.order_id=p_order_id
      AND mi.category=v_offer.target_category;
  ELSE
    v_eligible:=COALESCE(p_subtotal,0);
  END IF;

  v_eligible:=GREATEST(v_eligible,0);

  -- BOGO/buy-get: when a specific get product is configured, count and price
  -- that product only. Otherwise use the order quantity/lowest unit price.
  v_type:=lower(COALESCE(v_offer.offer_type,'discount'));
  v_value:=GREATEST(COALESCE(v_offer.discount,0),0);

  IF v_type IN ('bogo','buy_get') THEN
    v_buy:=GREATEST(COALESCE(v_offer.buy_quantity,1),1);
    v_get:=GREATEST(COALESCE(v_offer.get_quantity,1),1);

    IF v_offer.get_product_id IS NOT NULL THEN
      SELECT COALESCE(SUM(oi.quantity),0),COALESCE(MIN(oi.unit_price),0)
      INTO v_qty,v_free_price
      FROM public.order_items oi
      WHERE oi.order_id=p_order_id
        AND oi.item_id=v_offer.get_product_id;
    ELSE
      SELECT COALESCE(SUM(oi.quantity),0),COALESCE(MIN(oi.unit_price),0)
      INTO v_qty,v_free_price
      FROM public.order_items oi
      WHERE oi.order_id=p_order_id;
    END IF;

    IF v_qty<v_buy+v_get OR v_free_price<=0 THEN RETURN 0; END IF;
    v_discount:=FLOOR(v_qty/(v_buy+v_get))*v_get*v_free_price;

  ELSIF v_type='free_item' THEN
    IF v_offer.get_product_id IS NULL THEN RETURN 0; END IF;

    SELECT COALESCE(MIN(oi.unit_price),0)
    INTO v_free_price
    FROM public.order_items oi
    WHERE oi.order_id=p_order_id
      AND oi.item_id=v_offer.get_product_id;

    IF v_free_price<=0 THEN
      SELECT COALESCE(mi.price,0)
      INTO v_free_price
      FROM public.menu_items mi
      WHERE mi.id=v_offer.get_product_id;
    END IF;

    IF v_free_price<=0 THEN RETURN 0; END IF;
    v_discount:=v_free_price*GREATEST(COALESCE(v_offer.get_quantity,1),1);

  ELSIF v_eligible>0 THEN
    IF lower(COALESCE(v_offer.discount_type,'percent'))='flat' THEN
      v_discount:=LEAST(v_eligible,v_value);
    ELSE
      v_discount:=LEAST(v_eligible,v_eligible*LEAST(v_value,100)/100);
    END IF;
  ELSE
    RETURN 0;
  END IF;

  IF v_offer.max_discount IS NOT NULL THEN
    v_discount:=LEAST(v_discount,GREATEST(v_offer.max_discount,0));
  END IF;

  RETURN ROUND(GREATEST(v_discount,0),2);
END;
$$;


ALTER FUNCTION "public"."calculate_offer_discount"("p_offer_id" "uuid", "p_order_id" "uuid", "p_subtotal" numeric) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."create_order_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_source text;
  v_total text;
begin
  v_source := coalesce(nullif(trim(new.source_label), ''), initcap(replace(coalesce(new.source_type, 'order'), '_', ' ')), 'New order');
  v_total := '₹' || to_char(coalesce(new.total_amount, 0), 'FM999,999,999,990.00');

  insert into public.notifications (
    restaurant_id,
    user_id,
    type,
    title,
    message,
    action_url
  ) values (
    new.restaurant_id,
    null,
    'success',
    'New order received',
    format('%s • %s', v_source, v_total),
    '/kitchen'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."create_order_notification"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."order_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "token_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "token_no" integer NOT NULL,
    "token_type" "text" DEFAULT 'takeaway'::"text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "pickup_name" "text",
    "pickup_phone" "text",
    "otp" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ready_at" timestamp with time zone,
    "picked_up_at" timestamp with time zone
);


ALTER TABLE "public"."order_tokens" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text" DEFAULT 'takeaway'::"text", "p_pickup_name" "text" DEFAULT NULL::"text", "p_pickup_phone" "text" DEFAULT NULL::"text") RETURNS "public"."order_tokens"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_token public.order_tokens%rowtype;
  v_next integer;
begin
  if not exists (
    select 1 from public.orders
    where id = p_order_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'Order not found for restaurant';
  end if;

  select coalesce(max(token_no), 0) + 1
    into v_next
  from public.order_tokens
  where restaurant_id = p_restaurant_id
    and token_date = current_date;

  insert into public.order_tokens(
    restaurant_id, order_id, token_date, token_no, token_type,
    pickup_name, pickup_phone
  )
  values(
    p_restaurant_id, p_order_id, current_date, v_next,
    coalesce(nullif(trim(p_token_type), ''), 'takeaway'),
    nullif(trim(p_pickup_name), ''),
    nullif(trim(p_pickup_phone), '')
  )
  returning * into v_token;

  return v_token;
end;
$$;


ALTER FUNCTION "public"."create_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text", "p_pickup_name" "text", "p_pickup_phone" "text") OWNER TO "postgres";


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
  v_count integer := 0;
  v_type text;
  v_combo jsonb;
  v_component_names text;
  v_component jsonb;
  v_component_id uuid;
  v_component_qty integer;
  v_selected jsonb;
  v_selected_name text;
  v_offer public.offers%ROWTYPE;
  v_requested_offer uuid;
  v_discount_type text;
  v_discount_value numeric(12,2);
  v_discount numeric(12,2) := 0;
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

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND OR v_restaurant.status <> 'active' THEN
    RAISE EXCEPTION 'Restaurant is not active';
  END IF;

  IF NOT public.has_restaurant_plan_feature(v_restaurant.id, 'qr-menu') THEN
    RAISE EXCEPTION 'QR Menu is not available on this restaurant plan';
  END IF;

  IF lower(trim(p_type)) = 'table' THEN
    SELECT format('Table %s', table_number) INTO v_source_label
    FROM public.tables WHERE id = p_source_id AND restaurant_id = v_restaurant.id;
  ELSE
    SELECT format('Room %s', room_number) INTO v_source_label
    FROM public.rooms WHERE id = p_source_id AND restaurant_id = v_restaurant.id;
  END IF;

  IF v_source_label IS NULL THEN
    RAISE EXCEPTION 'QR source does not belong to restaurant';
  END IF;

  IF NULLIF(trim(coalesce(p_offer_id, '')), '') IS NOT NULL THEN
    BEGIN
      v_requested_offer := trim(p_offer_id)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_requested_offer := NULL;
    END;
  END IF;

  INSERT INTO public.orders (restaurant_id, source_type, source_id, source_label, status, overall_note)
  VALUES (v_restaurant.id, lower(trim(p_type)), p_source_id::text, v_source_label, 'pending', NULLIF(left(coalesce(p_overall_note,''),1000),''))
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_count := v_count + 1;
    BEGIN v_item_id := NULLIF(v_item->>'item_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid item at position %', v_count; END;
    v_qty := (v_item->>'quantity')::integer;
    v_request := NULLIF(left(coalesce(v_item->>'cooking_request',''),500),'');

    IF v_item_id IS NULL OR v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN
      RAISE EXCEPTION 'Invalid item at position %', v_count;
    END IF;

    SELECT mi.name, mi.price::numeric, COALESCE(mi.item_type,'single'), mi.combo_config
      INTO v_name, v_price, v_type, v_combo
    FROM public.menu_items mi
    WHERE mi.id = v_item_id AND mi.restaurant_id = v_restaurant.id
    LIMIT 1;

    IF v_name IS NULL THEN RAISE EXCEPTION 'Menu item does not belong to restaurant'; END IF;

    IF v_type = 'combo' THEN
      v_component_names := '';
      IF jsonb_typeof(v_combo->'items') = 'array' THEN
        FOR v_component IN SELECT * FROM jsonb_array_elements(v_combo->'items') LOOP
          BEGIN v_component_id := NULLIF(v_component->>'item_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid combo component'; END;
          v_component_qty := COALESCE((v_component->>'quantity')::integer,1);
          SELECT mi.name INTO v_selected_name FROM public.menu_items mi WHERE mi.id=v_component_id AND mi.restaurant_id=v_restaurant.id LIMIT 1;
          IF v_selected_name IS NULL THEN RAISE EXCEPTION 'Combo component does not belong to restaurant'; END IF;
          v_component_names := concat_ws(', ', NULLIF(v_component_names,''), format('%sx %s', v_component_qty, v_selected_name));
        END LOOP;
      END IF;

      IF jsonb_typeof(v_combo->'groups') = 'array' THEN
        v_selected := v_item->'combo_selection';
        IF v_selected IS NULL OR jsonb_typeof(v_selected) <> 'array' THEN
          RAISE EXCEPTION 'Please select combo options';
        END IF;
        IF jsonb_array_length(v_selected) < COALESCE(((v_combo->'groups'->0)->>'min')::integer,1)
           OR jsonb_array_length(v_selected) > COALESCE(((v_combo->'groups'->0)->>'max')::integer,1) THEN
          RAISE EXCEPTION 'Invalid number of combo options';
        END IF;
        FOR v_component IN SELECT * FROM jsonb_array_elements(v_selected) LOOP
          BEGIN v_component_id := NULLIF(v_component->>'item_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid combo selection'; END;
          IF NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(v_combo->'groups'->0->'options','[]'::jsonb)) opt
            WHERE opt->>'item_id' = v_component_id::text
          ) THEN
            RAISE EXCEPTION 'Selected item is not available in this combo';
          END IF;
          SELECT mi.name INTO v_selected_name FROM public.menu_items mi WHERE mi.id=v_component_id AND mi.restaurant_id=v_restaurant.id LIMIT 1;
          IF v_selected_name IS NULL THEN RAISE EXCEPTION 'Invalid combo selection'; END IF;
          v_component_names := concat_ws(', ', NULLIF(v_component_names,''), v_selected_name);
        END LOOP;
      END IF;
    ELSE
      v_component_names := '';
    END IF;

    INSERT INTO public.order_items(order_id,item_id,quantity,cooking_request,item_name,unit_price,line_total)
    VALUES (
      v_order_id,
      v_item_id,
      v_qty,
      v_request,
      CASE WHEN v_type='combo' AND v_component_names<>'' THEN format('%s [%s]',v_name,v_component_names) ELSE v_name END,
      v_price,
      v_price*v_qty
    );
    v_subtotal := v_subtotal + v_price*v_qty;
  END LOOP;

  IF v_requested_offer IS NOT NULL THEN
    SELECT * INTO v_offer FROM public.offers
    WHERE id=v_requested_offer AND restaurant_id=v_restaurant.id AND COALESCE(active,true)
      AND (valid_from IS NULL OR valid_from<=CURRENT_DATE) AND (valid_till IS NULL OR valid_till>=CURRENT_DATE)
      AND COALESCE(min_order,0)<=v_subtotal;
  END IF;

  IF v_offer.id IS NULL THEN
    SELECT * INTO v_offer FROM public.offers
    WHERE restaurant_id=v_restaurant.id AND COALESCE(active,true)
      AND (valid_from IS NULL OR valid_from<=CURRENT_DATE) AND (valid_till IS NULL OR valid_till>=CURRENT_DATE)
      AND COALESCE(min_order,0)<=v_subtotal
    ORDER BY CASE WHEN lower(COALESCE(discount_type,'percent'))='flat' THEN LEAST(v_subtotal,GREATEST(COALESCE(discount,0),0)) ELSE LEAST(v_subtotal,v_subtotal*LEAST(GREATEST(COALESCE(discount,0),0),100)/100) END DESC, created_at DESC
    LIMIT 1;
  END IF;

  IF v_offer.id IS NOT NULL THEN
    v_discount_type := lower(COALESCE(v_offer.discount_type,'percent'));
    v_discount_value := GREATEST(COALESCE(v_offer.discount,0),0);
    IF v_discount_type='flat' THEN v_discount := LEAST(v_subtotal,v_discount_value);
    ELSE v_discount := LEAST(v_subtotal,v_subtotal*LEAST(v_discount_value,100)/100); END IF;
    IF v_offer.max_discount IS NOT NULL THEN v_discount := LEAST(v_discount,GREATEST(v_offer.max_discount,0)); END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_id',v_order_id,
    'restaurant_id',v_restaurant.id,
    'source_type',lower(trim(p_type)),
    'source_id',p_source_id,
    'source_label',v_source_label,
    'subtotal',v_subtotal,
    'discount_amount',round(v_discount,2),
    'total_amount',round(v_subtotal-v_discount,2),
    'offer_id',v_offer.id
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


CREATE OR REPLACE FUNCTION "public"."delete_restaurant_cascade"("p_restaurant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_exists boolean;
  v_count bigint := 0;
  v_total bigint := 0;
  v_table record;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  -- Deep child records first.
  DELETE FROM public.item_ingredients
  WHERE menu_item_id IN (
    SELECT id FROM public.menu_items WHERE restaurant_id = p_restaurant_id
  )
  OR inventory_id IN (
    SELECT id FROM public.inventory WHERE restaurant_id = p_restaurant_id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.order_items
  WHERE order_id IN (
    SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id
  )
  OR item_id IN (
    SELECT id FROM public.menu_items WHERE restaurant_id = p_restaurant_id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.stock_usage WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.inventory_transactions WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.audit_logs WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.plugin_logs WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.reservations WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.orders WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.offers WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.restaurant_banners WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.restaurant_plugins WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.plugin_settings WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.plugins WHERE restaurant_id = p_restaurant_id::text;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.invoice_sequences WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.menu_items WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.inventory WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.tables WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.rooms WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  -- Remove restaurant-linked user profiles. The auth users themselves are
  -- intentionally cleaned by the protected Next.js API after this function,
  -- so an auth user shared by multiple restaurants is never deleted here.
  DELETE FROM public.profiles WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  -- Catch future/current restaurant-scoped tables that were not explicitly
  -- listed above. This keeps the deletion comprehensive as the SaaS grows.
  FOR v_table IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'restaurant_id'
      AND table_name <> 'restaurants'
      AND table_name NOT IN (
        'item_ingredients','order_items','stock_usage','inventory_transactions',
        'audit_logs','plugin_logs','reservations','orders','offers',
        'restaurant_banners','restaurant_plugins','plugin_settings','plugins',
        'invoice_sequences','menu_items','inventory','tables','rooms','profiles'
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name = columns.table_name
          AND t.table_type = 'BASE TABLE'
      )
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE restaurant_id = $1', v_table.table_name)
      USING p_restaurant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  END LOOP;

  DELETE FROM public.restaurants WHERE id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  RETURN jsonb_build_object(
    'success', true,
    'restaurant_id', p_restaurant_id,
    'deleted_rows', v_total
  );
END;
$_$;


ALTER FUNCTION "public"."delete_restaurant_cascade"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "balance" numeric DEFAULT 0 NOT NULL,
    "points" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_wallets" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_customer_wallet"("p_restaurant_id" "uuid", "p_customer_id" "uuid") RETURNS "public"."customer_wallets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v public.customer_wallets%rowtype;
begin
  insert into public.customer_wallets(restaurant_id, customer_id)
  values(p_restaurant_id,p_customer_id)
  on conflict(restaurant_id,customer_id) do nothing;
  select * into v from public.customer_wallets
  where restaurant_id=p_restaurant_id and customer_id=p_customer_id;
  return v;
end;
$$;


ALTER FUNCTION "public"."ensure_customer_wallet"("p_restaurant_id" "uuid", "p_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_kitchen_order_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.kitchen_order_tickets kot WHERE kot.order_id = NEW.id
  ) THEN
    INSERT INTO public.kitchen_order_tickets (
      restaurant_id, order_id, status, priority, notes
    ) VALUES (
      NEW.restaurant_id, NEW.id,
      CASE WHEN lower(coalesce(NEW.status,'')) = 'cancelled' THEN 'cancelled' ELSE 'new' END,
      CASE WHEN lower(coalesce(NEW.priority,'')) IN ('high','urgent') THEN lower(NEW.priority) ELSE 'normal' END,
      NULLIF(left(coalesce(NEW.overall_note,''),1000),'')
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_kitchen_order_ticket"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_legacy_kot_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_kot_no integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.kot_tickets WHERE order_id = NEW.id
  ) THEN
    SELECT COALESCE(MAX(kot_no), 0) + 1
      INTO v_kot_no
    FROM public.kot_tickets
    WHERE restaurant_id = NEW.restaurant_id;

    INSERT INTO public.kot_tickets(
      restaurant_id, order_id, kot_no, status
    )
    VALUES(
      NEW.restaurant_id,
      NEW.id,
      v_kot_no,
      CASE
        WHEN lower(coalesce(NEW.status,'')) IN ('cancelled','canceled','void','voided')
          THEN 'cancelled'
        WHEN lower(coalesce(NEW.status,'')) = 'preparing'
          THEN 'preparing'
        WHEN lower(coalesce(NEW.status,'')) IN ('done','completed','complete')
          THEN 'ready'
        ELSE 'new'
      END
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_legacy_kot_ticket"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_rating_summary"("p_restaurant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'average', COALESCE(ROUND(AVG(rating)::numeric, 1), 0),
    'count', COUNT(*)
  )
  FROM public.customer_feedback
  WHERE restaurant_id = p_restaurant_id;
$$;


ALTER FUNCTION "public"."get_public_rating_summary"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_restaurant_plan"("p_restaurant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'subscription', to_jsonb(rs),
    'plan', to_jsonb(sp)
  )
  INTO v_result
  FROM public.restaurant_subscriptions rs
  LEFT JOIN public.saas_plans sp ON sp.id = rs.saas_plan_id
  WHERE rs.restaurant_id = p_restaurant_id
  ORDER BY rs.updated_at DESC NULLS LAST, rs.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_result, jsonb_build_object('subscription', null, 'plan', null));
END;
$$;


ALTER FUNCTION "public"."get_restaurant_plan"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_plan_feature"("p_plugin_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT
        CASE
            WHEN public.is_super_admin() THEN true

            ELSE EXISTS (
                SELECT 1
                FROM public.restaurant_subscriptions rs
                JOIN public.plan_features pf
                    ON pf.plan_id = rs.plan_id
                WHERE rs.restaurant_id = public.current_restaurant_id()
                  AND rs.status IN ('trial', 'active')
                  AND pf.plugin_code = p_plugin_code
                  AND pf.enabled = true
                  AND (
                      rs.expires_at IS NULL
                      OR rs.expires_at > now()
                  )
            )
        END;
$$;


ALTER FUNCTION "public"."has_plan_feature"("p_plugin_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_restaurant_plan_feature"("p_restaurant_id" "uuid", "p_plugin_code" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  v_plan public.saas_plans%ROWTYPE;
  v_code text := lower(trim(coalesce(p_plugin_code, '')));
BEGIN
  SELECT status INTO v_status
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF COALESCE(v_status, 'inactive') <> 'active' THEN
    RETURN false;
  END IF;

  SELECT sp.* INTO v_plan
  FROM public.restaurant_subscriptions rs
  JOIN public.saas_plans sp ON sp.id = rs.saas_plan_id
  WHERE rs.restaurant_id = p_restaurant_id
    AND rs.status = 'active'
    AND sp.active = true
    AND (rs.starts_at IS NULL OR rs.starts_at <= now())
    AND (rs.ends_at IS NULL OR rs.ends_at >= now())
  ORDER BY rs.updated_at DESC NULLS LAST, rs.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  CASE v_code
    WHEN 'pos' THEN RETURN true;
    WHEN 'billing' THEN RETURN true;
    WHEN 'qr-menu' THEN RETURN COALESCE(v_plan.qr_ordering, false);
    WHEN 'loyalty' THEN RETURN COALESCE(v_plan.loyalty, false);
    WHEN 'offers' THEN RETURN COALESCE(v_plan.offers, false);
    WHEN 'analytics' THEN RETURN COALESCE(v_plan.analytics, false);
    WHEN 'reservations' THEN RETURN COALESCE(v_plan.reservations, false);
    WHEN 'whatsapp' THEN RETURN COALESCE(v_plan.whatsapp, false);
    ELSE RETURN false;
  END CASE;
END;
$$;


ALTER FUNCTION "public"."has_restaurant_plan_feature"("p_restaurant_id" "uuid", "p_plugin_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_staff_permission"("p_staff_id" "uuid", "p_permission_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.profiles p
      left join public.staff_permissions sp
        on sp.staff_id = p.id
       and sp.restaurant_id = p.restaurant_id
       and sp.permission_key = p_permission_key
       and sp.enabled = true
      where p.id = p_staff_id
        and (
          p.role in ('admin','super_admin')
          or sp.id is not null
        )
    );
$$;


ALTER FUNCTION "public"."has_staff_permission"("p_staff_id" "uuid", "p_permission_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'super_admin'), false);
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_restaurant_feature_enabled"("p_restaurant_id" "uuid", "p_plugin_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.restaurant_plugins rp
    where rp.restaurant_id=p_restaurant_id
      and rp.enabled=true
      and rp.plugin_code=lower(trim(p_plugin_code))
  );
$$;


ALTER FUNCTION "public"."is_restaurant_feature_enabled"("p_restaurant_id" "uuid", "p_plugin_code" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."issue_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text" DEFAULT 'pickup'::"text", "p_display_name" "text" DEFAULT NULL::"text") RETURNS "public"."order_tokens"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v public.order_tokens%rowtype; n integer;
begin
  if not public.is_restaurant_member(p_restaurant_id) then raise exception 'Not authorized'; end if;
  select coalesce(max(nullif(regexp_replace(token_no,'[^0-9]','','g'),'')::integer),0)+1 into n from public.order_tokens where restaurant_id=p_restaurant_id and token_type=p_token_type and created_at::date=current_date;
  insert into public.order_tokens(restaurant_id,order_id,token_no,token_type,display_name) values(p_restaurant_id,p_order_id,upper(left(p_token_type,1))||lpad(n::text,3,'0'),p_token_type,p_display_name) returning * into v;
  return v;
end $$;


ALTER FUNCTION "public"."issue_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text", "p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."make_restaurant_slug"("p_name" "text", "p_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  base_slug text;
  candidate text;
  n integer := 0;
BEGIN
  base_slug := lower(trim(regexp_replace(coalesce(p_name, 'restaurant'), '[^a-zA-Z0-9]+', '-', 'g')));
  base_slug := trim(both '-' from base_slug);

  IF base_slug = '' THEN
    base_slug := 'restaurant';
  END IF;

  candidate := base_slug;

  WHILE EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.slug = candidate AND r.id <> p_id
  ) LOOP
    n := n + 1;
    candidate := base_slug || '-' || substr(p_id::text, 1, 6);
    IF n > 1 THEN
      candidate := base_slug || '-' || substr(p_id::text, 1, 6) || '-' || n::text;
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;


ALTER FUNCTION "public"."make_restaurant_slug"("p_name" "text", "p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_delivery_slip_no"("p_restaurant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_next integer;
begin
  select coalesce(max((regexp_replace(slip_no, '[^0-9]', '', 'g'))::integer),0) + 1
    into v_next
  from public.restaurant_deliveries
  where restaurant_id = p_restaurant_id
    and slip_no ~ '^DL-[0-9]+$';

  return 'DL-' || lpad(v_next::text, 5, '0');
end;
$_$;


ALTER FUNCTION "public"."next_delivery_slip_no"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  restaurant_name text;
  order_source text;
  order_total text;
begin
  select r.name into restaurant_name
  from public.restaurants r
  where r.id = NEW.restaurant_id;

  order_source := coalesce(nullif(NEW.source_label, ''), initcap(coalesce(NEW.source_type, 'order')));
  order_total := to_char(coalesce(NEW.total_amount, 0), 'FM999999990.00');

  insert into public.notifications (
    restaurant_id,
    type,
    title,
    message,
    action_url
  )
  values (
    NEW.restaurant_id,
    'order',
    'New order received',
    format('%s • Order #%s • ₹%s', order_source, left(NEW.id::text, 8), order_total),
    '/kitchen'
  );

  return NEW;
end;
$$;


ALTER FUNCTION "public"."notify_new_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preview_order_offers"("p_order_id" "uuid", "p_subtotal" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_profile record;
  v_order public.orders%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_profile FROM public.stage3_current_profile();

  IF v_profile.user_id IS NULL
     OR v_profile.role NOT IN ('admin','staff','super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_profile.role <> 'super_admin'
     AND v_order.restaurant_id <> v_profile.restaurant_id THEN
    RAISE EXCEPTION 'Order belongs to another restaurant';
  END IF;

  SELECT COALESCE(jsonb_agg(
    to_jsonb(o) || jsonb_build_object(
      'calculated_discount', public.calculate_offer_discount(o.id, p_order_id, GREATEST(COALESCE(p_subtotal,0),0))
    )
    ORDER BY
      CASE WHEN o.stacking = 'exclusive' THEN 0 ELSE 1 END,
      o.priority DESC,
      public.calculate_offer_discount(o.id, p_order_id, GREATEST(COALESCE(p_subtotal,0),0)) DESC,
      o.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.offers o
  WHERE o.restaurant_id = v_order.restaurant_id
    AND public.calculate_offer_discount(
      o.id,
      p_order_id,
      GREATEST(COALESCE(p_subtotal,0),0)
    ) > 0;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."preview_order_offers"("p_order_id" "uuid", "p_subtotal" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_loyalty_config"("p_restaurant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.loyalty_settings(restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  insert into public.loyalty_tiers(restaurant_id,name,min_points,multiplier,benefits,sort_order)
  values
    (p_restaurant_id,'Bronze',0,1,'Base loyalty member',1),
    (p_restaurant_id,'Silver',500,1.10,'10% bonus points',2),
    (p_restaurant_id,'Gold',1500,1.25,'25% bonus points + priority offers',3),
    (p_restaurant_id,'Platinum',5000,1.50,'50% bonus points + premium rewards',4)
  on conflict (restaurant_id,name) do nothing;

  insert into public.loyalty_rewards(restaurant_id,name,description,points_cost,reward_type,reward_value,min_order_amount,active)
  values
    (p_restaurant_id,'₹100 OFF','Redeem 500 points on eligible bills',500,'discount',100,0,true),
    (p_restaurant_id,'10% OFF','Redeem 700 points for a percentage discount',700,'percent',10,0,true),
    (p_restaurant_id,'Free Dessert','Redeem 300 points for a complimentary dessert',300,'free_item',0,0,true)
  on conflict (restaurant_id,name) do nothing;
end;
$$;


ALTER FUNCTION "public"."seed_default_loyalty_config"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dining_tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "area_id" "uuid",
    "table_no" "text" NOT NULL,
    "capacity" integer DEFAULT 2 NOT NULL,
    "shape" "text" DEFAULT 'square'::"text" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "x" integer DEFAULT 0 NOT NULL,
    "y" integer DEFAULT 0 NOT NULL,
    "width" integer DEFAULT 120 NOT NULL,
    "height" integer DEFAULT 80 NOT NULL,
    "qr_enabled" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dining_tables" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_dining_table_status"("p_restaurant_id" "uuid", "p_table_id" "uuid", "p_status" "text") RETURNS "public"."dining_tables"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_row public.dining_tables%rowtype;
begin
  if not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'Not authorized';
  end if;

  update public.dining_tables
  set status = lower(trim(p_status))
  where id = p_table_id and restaurant_id = p_restaurant_id
  returning * into v_row;

  if not found then raise exception 'Table not found'; end if;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."set_dining_table_status"("p_restaurant_id" "uuid", "p_table_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_restaurant_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
    NEW.slug := public.make_restaurant_slug(NEW.name, NEW.id);
  ELSE
    NEW.slug := lower(trim(NEW.slug));
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_restaurant_slug"() OWNER TO "postgres";


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
BEGIN

  /*
   * Legacy 4-argument compatibility wrapper.
   *
   * IMPORTANT:
   * Invoice generation must happen only inside the canonical
   * 5-argument function so that invoice_sequences is incremented
   * exactly once.
   */

  SELECT *
  INTO v_profile
  FROM public.stage3_current_profile();

  IF v_profile.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN public.stage3_finalize_order(
    v_profile.user_id,
    p_order_id,
    p_payment_method,
    p_paid_amount,
    p_offer_id
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


CREATE OR REPLACE FUNCTION "public"."sync_delivery_from_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF lower(coalesce(NEW.order_mode,'')) = 'delivery' THEN
    IF lower(coalesce(NEW.status,'')) IN ('completed','done','delivered','served') THEN
      UPDATE public.restaurant_deliveries
      SET status = 'delivered'
      WHERE order_id = NEW.id
        AND restaurant_id = NEW.restaurant_id
        AND status <> 'cancelled';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_delivery_from_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_kitchen_ticket_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.kitchen_order_tickets
  SET
    status = CASE
      WHEN lower(NEW.status) = 'preparing' THEN 'preparing'
      WHEN lower(NEW.status) IN ('done','completed','complete') THEN 'ready'
      WHEN lower(NEW.status) IN ('cancelled','canceled','void','voided') THEN 'cancelled'
      ELSE 'new'
    END,
    accepted_at = CASE WHEN lower(NEW.status) = 'preparing' AND accepted_at IS NULL THEN now() ELSE accepted_at END,
    preparing_at = CASE WHEN lower(NEW.status) = 'preparing' AND preparing_at IS NULL THEN now() ELSE preparing_at END,
    ready_at = CASE WHEN lower(NEW.status) IN ('done','completed','complete') AND ready_at IS NULL THEN now() ELSE ready_at END,
    bumped_at = CASE WHEN lower(NEW.status) IN ('cancelled','canceled','void','voided') THEN now() ELSE bumped_at END
  WHERE order_id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_kitchen_ticket_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_legacy_kot_ticket_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.kot_tickets
  SET status = CASE
    WHEN lower(coalesce(NEW.status,'')) = 'preparing' THEN 'preparing'
    WHEN lower(coalesce(NEW.status,'')) IN ('done','completed','complete') THEN 'ready'
    WHEN lower(coalesce(NEW.status,'')) IN ('cancelled','canceled','void','voided') THEN 'cancelled'
    ELSE status
  END
  WHERE order_id = NEW.id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_legacy_kot_ticket_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_order_payment_totals"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_refunded numeric(12,2) := 0;
  v_status text := 'unpaid';
  v_method text;
BEGIN
  SELECT COALESCE(o.total_amount, 0)
  INTO v_total
  FROM public.orders AS o
  WHERE o.id = p_order_id;

  SELECT COALESCE(SUM(op.amount), 0)
  INTO v_paid
  FROM public.order_payments AS op
  WHERE op.order_id = p_order_id
    AND op.status = 'paid';

  SELECT COALESCE(SUM(r.amount), 0)
  INTO v_refunded
  FROM public.order_refunds AS r
  WHERE r.order_id = p_order_id
    AND r.status = 'refunded';

  v_paid := greatest(least(v_paid - v_refunded, v_total), 0);

  SELECT op.payment_method
  INTO v_method
  FROM public.order_payments AS op
  WHERE op.order_id = p_order_id
    AND op.status = 'paid'
  ORDER BY op.paid_at DESC NULLS LAST, op.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_total > 0 AND v_paid >= v_total THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partially_paid';
  END IF;

  UPDATE public.orders AS o
  SET
    paid_amount = v_paid,
    payment_status = v_status,
    payment_method = COALESCE(v_method, o.payment_method),
    updated_at = now()
  WHERE o.id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."sync_order_payment_totals"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_restaurant_status_from_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.saas_plan_id IS NOT NULL THEN
    UPDATE public.restaurants
    SET status = 'active'
    WHERE id = NEW.restaurant_id;
  ELSIF NEW.status IN ('pending','past_due','cancelled','expired') THEN
    UPDATE public.restaurants
    SET status = 'inactive'
    WHERE id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_restaurant_status_from_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_customer_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_customer_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_delivery_zone_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_delivery_zone_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_order_terminal_automation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if lower(coalesce(new.status,'')) in ('done','completed','served','paid')
     and lower(coalesce(old.status,'')) not in ('done','completed','served','paid') then
    perform public.apply_recipe_stock_deduction(new.id);
  end if;

  if lower(coalesce(new.order_mode,'')) in ('takeaway','delivery')
     and not exists (
       select 1 from public.order_tokens
       where order_id = new.id
     ) then
    perform public.create_order_token(
      new.restaurant_id,
      new.id,
      lower(new.order_mode),
      null,
      null
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_order_terminal_automation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_sync_order_payment_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_order_payment_totals(OLD.order_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_order_payment_totals(NEW.order_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_sync_order_payment_totals"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aggregator_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "outlet_code" "text",
    "active" boolean DEFAULT false NOT NULL,
    "credentials" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aggregator_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aggregator_menu_controls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "channel_code" "text" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "external_item_id" "text",
    "available" boolean DEFAULT true NOT NULL,
    "external_price" numeric,
    "sync_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aggregator_menu_controls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aggregator_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "integration_id" "uuid",
    "provider" "text" NOT NULL,
    "external_order_id" "text" NOT NULL,
    "order_id" "uuid",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "commission" numeric(12,2) DEFAULT 0 NOT NULL,
    "platform_discount" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_payout" numeric(12,2) DEFAULT 0 NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aggregator_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aggregator_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "channel_code" "text" NOT NULL,
    "payout_reference" "text",
    "payout_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "gross_sales" numeric DEFAULT 0 NOT NULL,
    "commission" numeric DEFAULT 0 NOT NULL,
    "platform_charges" numeric DEFAULT 0 NOT NULL,
    "taxes" numeric DEFAULT 0 NOT NULL,
    "cancellations" numeric DEFAULT 0 NOT NULL,
    "net_payout" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aggregator_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aggregator_settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "payout_reference" "text",
    "gross_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "commission" numeric(12,2) DEFAULT 0 NOT NULL,
    "discounts" numeric(12,2) DEFAULT 0 NOT NULL,
    "cancellations" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aggregator_settlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aggregator_sync_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aggregator_sync_jobs" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."branch_inventory_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "inventory_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 0,
    "reorder_level" numeric DEFAULT 0
);


ALTER TABLE "public"."branch_inventory_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branch_menu_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true,
    "price" numeric,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."branch_menu_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calling_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "device_code" "text",
    "location" "text",
    "active" boolean DEFAULT true NOT NULL,
    "last_called_at" timestamp with time zone
);


ALTER TABLE "public"."calling_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calling_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "table_id" "uuid",
    "customer_name" "text",
    "request_type" "text" DEFAULT 'waiter'::"text" NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "called_at" timestamp with time zone,
    "acknowledged_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calling_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."captain_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "staff_name" "text",
    "device_name" "text",
    "active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."captain_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_closings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "business_date" "date" NOT NULL,
    "opening_cash" numeric(14,2) DEFAULT 0 NOT NULL,
    "cash_sales" numeric(14,2) DEFAULT 0 NOT NULL,
    "refunds" numeric(14,2) DEFAULT 0 NOT NULL,
    "expected_cash" numeric(14,2) DEFAULT 0 NOT NULL,
    "actual_cash" numeric(14,2) DEFAULT 0 NOT NULL,
    "difference" numeric(14,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "closed_by" "uuid",
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cash_closings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "movement_type" "text" NOT NULL,
    "amount" numeric DEFAULT 0,
    "reference" "text",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cash_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "terminal_id" "uuid",
    "cashier_id" "uuid",
    "opening_cash" numeric(12,2) DEFAULT 0 NOT NULL,
    "expected_cash" numeric(12,2) DEFAULT 0 NOT NULL,
    "actual_cash" numeric(12,2),
    "difference" numeric(12,2),
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "notes" "text"
);


ALTER TABLE "public"."cash_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."central_kitchens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "active" boolean DEFAULT true NOT NULL,
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."central_kitchens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "order_id" "uuid",
    "rating" integer NOT NULL,
    "feedback" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."customer_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "plan_name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "starts_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "discount_percent" numeric DEFAULT 0,
    "points_multiplier" numeric DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "birthday" "date",
    "anniversary" "date",
    "favorite_items" "jsonb" DEFAULT '[]'::"jsonb",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "vip" boolean DEFAULT false,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_segment_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "segment_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "score" numeric(12,2),
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_segment_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "wallet_id" "uuid",
    "transaction_type" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "points" numeric DEFAULT 0 NOT NULL,
    "reference_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_wallet_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "notes" "text",
    "loyalty_points" integer DEFAULT 0 NOT NULL,
    "total_orders" integer DEFAULT 0 NOT NULL,
    "total_spend" numeric(14,2) DEFAULT 0 NOT NULL,
    "last_visit_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customers_loyalty_points_check" CHECK (("loyalty_points" >= 0))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "rider_id" "uuid",
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "delivery_charge" numeric(12,2) DEFAULT 0 NOT NULL,
    "address" "text",
    "proof_url" "text",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "out_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "failure_reason" "text"
);


ALTER TABLE "public"."delivery_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "delivery_id" "uuid",
    "status" "text" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."delivery_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_otps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "otp_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "verified_at" timestamp with time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."delivery_otps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_riders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "vehicle" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."delivery_riders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "rider_id" "uuid",
    "rider_name" "text",
    "settlement_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expected_cash" numeric DEFAULT 0 NOT NULL,
    "expected_upi" numeric DEFAULT 0 NOT NULL,
    "expected_card" numeric DEFAULT 0 NOT NULL,
    "submitted_cash" numeric DEFAULT 0 NOT NULL,
    "submitted_upi" numeric DEFAULT 0 NOT NULL,
    "submitted_card" numeric DEFAULT 0 NOT NULL,
    "difference" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."delivery_settlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "charge" numeric DEFAULT 0,
    "min_order" numeric DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."delivery_zones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."digital_display_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "token_no" "text",
    "display_name" "text",
    "message" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "called_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."digital_display_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."digital_display_playlists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "screen_type" "text" DEFAULT 'menu'::"text" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."digital_display_playlists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discount_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "discount_type" "text" DEFAULT 'percent'::"text" NOT NULL,
    "value" numeric(12,2) DEFAULT 0 NOT NULL,
    "min_order" numeric(12,2) DEFAULT 0 NOT NULL,
    "max_discount" numeric(12,2),
    "applies_to" "text" DEFAULT 'bill'::"text" NOT NULL,
    "requires_manager" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "valid_from" "date",
    "valid_to" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."discount_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dynamic_report_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "report_type" "text" NOT NULL,
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "columns_config" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "schedule" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dynamic_report_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."e_bill_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "invoice_no" "text",
    "document_type" "text" DEFAULT 'invoice'::"text" NOT NULL,
    "delivery_channel" "text" DEFAULT 'download'::"text" NOT NULL,
    "recipient" "text",
    "status" "text" DEFAULT 'generated'::"text" NOT NULL,
    "document_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."e_bill_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "amount" numeric(14,2) NOT NULL,
    "payment_method" "text" DEFAULT 'cash'::"text" NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expenses_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "customer_id" "uuid",
    "channel" "text" DEFAULT 'qr'::"text" NOT NULL,
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_cost_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "recipe_cost" numeric DEFAULT 0 NOT NULL,
    "selling_price" numeric DEFAULT 0 NOT NULL,
    "food_cost_percent" numeric DEFAULT 0 NOT NULL,
    "margin" numeric DEFAULT 0 NOT NULL,
    "calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."food_cost_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "forecast_date" "date" NOT NULL,
    "metric" "text" NOT NULL,
    "predicted_value" numeric DEFAULT 0 NOT NULL,
    "confidence" numeric,
    "source" "text" DEFAULT 'anaira'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forecast_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goods_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "purchase_order_id" "uuid",
    "grn_number" "text",
    "received_by" "uuid",
    "received_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."goods_receipts" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."inventory_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "inventory_id" "uuid",
    "batch_no" "text",
    "quantity" numeric DEFAULT 0,
    "unit" "text",
    "unit_cost" numeric DEFAULT 0,
    "received_at" timestamp with time zone DEFAULT "now"(),
    "expiry_date" "date",
    "status" "text" DEFAULT 'active'::"text"
);


ALTER TABLE "public"."inventory_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "inventory_id" "uuid",
    "movement_type" "text" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "unit" "text",
    "reference_type" "text",
    "reference_id" "uuid",
    "unit_cost" numeric DEFAULT 0,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."inventory_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "inventory_id" "uuid",
    "from_location" "text",
    "to_location" "text",
    "quantity" numeric DEFAULT 0,
    "unit" "text",
    "status" "text" DEFAULT 'completed'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_wastage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "inventory_id" "uuid",
    "quantity" numeric DEFAULT 0,
    "unit" "text",
    "reason" "text",
    "cost" numeric DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_wastage" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."kds_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "station_id" "uuid",
    "status" "text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "due_at" timestamp with time zone,
    "acknowledged_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."kds_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kitchen_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "kitchen_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "reference" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "dispatched_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."kitchen_dispatches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kitchen_order_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "station_id" "uuid",
    "status" "text" DEFAULT 'new'::"text",
    "priority" "text" DEFAULT 'normal'::"text",
    "due_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "preparing_at" timestamp with time zone,
    "ready_at" timestamp with time zone,
    "served_at" timestamp with time zone,
    "bumped_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kitchen_order_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kitchen_stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "station_type" "text" DEFAULT 'kitchen'::"text",
    "active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kitchen_stations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kot_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "station_id" "uuid",
    "category" "text",
    "printer_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."kot_routes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kot_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "kot_no" integer,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "printed_at" timestamp with time zone,
    "reprint_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    CONSTRAINT "kot_tickets_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'preparing'::"text", 'ready'::"text", 'served'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."kot_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "bonus_points" integer DEFAULT 0 NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_campaigns_bonus_points_check" CHECK (("bonus_points" >= 0))
);


ALTER TABLE "public"."loyalty_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "reward_id" "uuid" NOT NULL,
    "points" integer NOT NULL,
    "status" "text" DEFAULT 'redeemed'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_redemptions_points_check" CHECK (("points" > 0)),
    CONSTRAINT "loyalty_redemptions_status_check" CHECK (("status" = ANY (ARRAY['redeemed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."loyalty_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "referrer_customer_id" "uuid" NOT NULL,
    "referred_customer_id" "uuid",
    "code" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "points_awarded" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_referrals_points_awarded_check" CHECK (("points_awarded" >= 0)),
    CONSTRAINT "loyalty_referrals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'qualified'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."loyalty_referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "points_cost" integer NOT NULL,
    "reward_type" "text" DEFAULT 'discount'::"text" NOT NULL,
    "reward_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "min_order_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "usage_limit" integer,
    "used_count" integer DEFAULT 0 NOT NULL,
    "expires_days" integer,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_rewards_min_order_amount_check" CHECK (("min_order_amount" >= (0)::numeric)),
    CONSTRAINT "loyalty_rewards_points_cost_check" CHECK (("points_cost" > 0)),
    CONSTRAINT "loyalty_rewards_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['discount'::"text", 'percent'::"text", 'free_item'::"text", 'coupon'::"text"]))),
    CONSTRAINT "loyalty_rewards_reward_value_check" CHECK (("reward_value" >= (0)::numeric)),
    CONSTRAINT "loyalty_rewards_used_count_check" CHECK (("used_count" >= 0))
);


ALTER TABLE "public"."loyalty_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_settings" (
    "restaurant_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "points_per_rupee" numeric(10,4) DEFAULT 0.1000 NOT NULL,
    "min_bill_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "max_points_per_order" integer,
    "expiry_days" integer,
    "review_reward_points" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_settings_min_bill_amount_check" CHECK (("min_bill_amount" >= (0)::numeric)),
    CONSTRAINT "loyalty_settings_points_per_rupee_check" CHECK (("points_per_rupee" >= (0)::numeric)),
    CONSTRAINT "loyalty_settings_review_reward_points_check" CHECK (("review_reward_points" >= 0))
);


ALTER TABLE "public"."loyalty_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "min_points" integer DEFAULT 0 NOT NULL,
    "multiplier" numeric(8,3) DEFAULT 1 NOT NULL,
    "benefits" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_tiers_min_points_check" CHECK (("min_points" >= 0)),
    CONSTRAINT "loyalty_tiers_multiplier_check" CHECK (("multiplier" > (0)::numeric))
);


ALTER TABLE "public"."loyalty_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "points" integer NOT NULL,
    "transaction_type" "text" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['earn'::"text", 'redeem'::"text", 'adjustment'::"text", 'expiry'::"text"])))
);


ALTER TABLE "public"."loyalty_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "audience_filter" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "message" "text",
    "scheduled_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."marketing_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_item_modifier_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "modifier_group_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_item_modifier_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text",
    "price" integer,
    "category" "text",
    "restaurant_id" "uuid",
    "image" "text",
    "description" "text",
    "item_type" "text" DEFAULT 'single'::"text" NOT NULL,
    "combo_config" "jsonb"
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price_delta" numeric(12,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "channel" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "recipient" "text",
    "template" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "provider_message_id" "text",
    "sent_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modifier_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "selection_type" "text" DEFAULT 'single'::"text" NOT NULL,
    "required" boolean DEFAULT false NOT NULL,
    "min_select" integer DEFAULT 0 NOT NULL,
    "max_select" integer,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "modifier_groups_min_select_check" CHECK (("min_select" >= 0)),
    CONSTRAINT "modifier_groups_selection_type_check" CHECK (("selection_type" = ANY (ARRAY['single'::"text", 'multiple'::"text"])))
);


ALTER TABLE "public"."modifier_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "action_url" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offer_products" (
    "offer_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."offer_products" OWNER TO "postgres";


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
    "discount_type" "text" DEFAULT 'percent'::"text",
    "target_type" "text" DEFAULT 'all'::"text" NOT NULL,
    "target_category" "text",
    "max_discount" numeric(12,2),
    "usage_limit" integer,
    "featured" boolean DEFAULT false NOT NULL,
    "offer_type" "text" DEFAULT 'discount'::"text" NOT NULL,
    "buy_quantity" integer DEFAULT 1 NOT NULL,
    "get_quantity" integer DEFAULT 1 NOT NULL,
    "get_product_id" "uuid",
    "coupon_code" "text",
    "start_time" time without time zone,
    "end_time" time without time zone,
    "days_of_week" "text",
    "priority" integer DEFAULT 0 NOT NULL,
    "stacking" "text" DEFAULT 'best_only'::"text" NOT NULL,
    "customer_tier" "text",
    "new_customer_only" boolean DEFAULT false NOT NULL,
    CONSTRAINT "offers_offer_type_check" CHECK (("offer_type" = ANY (ARRAY['discount'::"text", 'bogo'::"text", 'buy_get'::"text", 'free_item'::"text"]))),
    CONSTRAINT "offers_stacking_check" CHECK (("stacking" = ANY (ARRAY['best_only'::"text", 'stackable'::"text", 'exclusive'::"text"])))
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offline_pos_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "terminal_id" "uuid",
    "client_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "processed_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."offline_pos_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."online_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "channel_code" "text" NOT NULL,
    "channel_name" "text" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."online_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."online_order_reconciliations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "channel_code" "text" NOT NULL,
    "external_order_id" "text",
    "order_id" "uuid",
    "gross_amount" numeric DEFAULT 0 NOT NULL,
    "discounts" numeric DEFAULT 0 NOT NULL,
    "commission" numeric DEFAULT 0 NOT NULL,
    "platform_charges" numeric DEFAULT 0 NOT NULL,
    "tax" numeric DEFAULT 0 NOT NULL,
    "payout_amount" numeric DEFAULT 0 NOT NULL,
    "cancellation_amount" numeric DEFAULT 0 NOT NULL,
    "settlement_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout_reference" "text",
    "order_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."online_order_reconciliations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_discount_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "discount_rule_id" "uuid",
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "approved_by" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_discount_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_holds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "hold_type" "text" DEFAULT 'hold'::"text" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "released_at" timestamp with time zone
);


ALTER TABLE "public"."order_holds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_item_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "modifier_id" "uuid",
    "modifier_name" "text" NOT NULL,
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "order_item_modifiers_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."order_item_modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_item_moves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "from_table_id" "uuid",
    "to_table_id" "uuid",
    "quantity" numeric DEFAULT 1 NOT NULL,
    "moved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_item_moves" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."order_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "payment_method" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "reference" "text",
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "paid_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "order_payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'upi'::"text", 'online'::"text", 'credit'::"text", 'other'::"text"]))),
    CONSTRAINT "order_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'refunded'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."order_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "payment_id" "uuid",
    "amount" numeric DEFAULT 0 NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'refunded'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_split_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "split_id" "uuid" NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."order_split_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "split_no" integer NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "source" "text" DEFAULT 'pos'::"text" NOT NULL,
    "note" "text",
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "from_table_id" "uuid",
    "to_table_id" "uuid",
    "moved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_transfers" OWNER TO "postgres";


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
    "cancellation_reason" "text",
    "customer_id" "uuid",
    "order_mode" "text" DEFAULT 'dine_in'::"text",
    "service_charge_amount" numeric DEFAULT 0,
    "tip_amount" numeric DEFAULT 0,
    "coupon_code" "text",
    "hold_status" "text" DEFAULT 'active'::"text",
    "void_reason" "text",
    "reopened_at" timestamp with time zone,
    "priority" "text" DEFAULT 'normal'::"text",
    "kitchen_due_at" timestamp with time zone,
    "waiter_id" "uuid",
    "table_id" "uuid",
    "service_charge" numeric(12,2) DEFAULT 0 NOT NULL,
    "packaging_charge" numeric(12,2) DEFAULT 0 NOT NULL,
    "customer_note" "text",
    "delivery_address" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "delivery_charge" numeric(12,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_gateway_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_gateway_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid",
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "processed_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_features" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "plugin_code" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "limits" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."plan_features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "price_monthly" numeric(10,2) DEFAULT 0 NOT NULL,
    "price_yearly" numeric(10,2) DEFAULT 0 NOT NULL,
    "max_staff" integer,
    "max_tables" integer,
    "max_menu_items" integer,
    "max_orders" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plans_max_menu_items_positive" CHECK ((("max_menu_items" IS NULL) OR ("max_menu_items" >= 0))),
    CONSTRAINT "plans_max_orders_positive" CHECK ((("max_orders" IS NULL) OR ("max_orders" >= 0))),
    CONSTRAINT "plans_max_staff_positive" CHECK ((("max_staff" IS NULL) OR ("max_staff" >= 0))),
    CONSTRAINT "plans_max_tables_positive" CHECK ((("max_tables" IS NULL) OR ("max_tables" >= 0))),
    CONSTRAINT "plans_price_monthly_nonnegative" CHECK (("price_monthly" >= (0)::numeric)),
    CONSTRAINT "plans_price_yearly_nonnegative" CHECK (("price_yearly" >= (0)::numeric))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plugin_catalog" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text",
    "category" "text" NOT NULL,
    "description" "text",
    "kind" "text" DEFAULT 'feature'::"text",
    "active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plugin_catalog" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."pos_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "before_data" "jsonb",
    "after_data" "jsonb",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_terminals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "terminal_code" "text" NOT NULL,
    "terminal_name" "text" NOT NULL,
    "device_type" "text" DEFAULT 'pos'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_terminals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."print_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "printer_id" "uuid",
    "job_type" "text" NOT NULL,
    "reference_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "printed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."print_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."printer_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "printer_type" "text" DEFAULT 'thermal'::"text" NOT NULL,
    "ip_address" "text",
    "port" integer DEFAULT 9100,
    "station_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."printer_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "restaurant_id" "uuid",
    "role" "text",
    "email" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "po_number" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "subtotal" numeric DEFAULT 0,
    "tax" numeric DEFAULT 0,
    "total" numeric DEFAULT 0,
    "expected_date" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "uses" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."referral_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "referral_code_id" "uuid" NOT NULL,
    "referred_customer_id" "uuid",
    "referrer_points" integer DEFAULT 0 NOT NULL,
    "referred_points" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."referral_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_exports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "report_type" "text" NOT NULL,
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "format" "text" DEFAULT 'csv'::"text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "requested_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_exports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "report_code" "text" NOT NULL,
    "schedule" "text" NOT NULL,
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "recipient" "text",
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "next_run_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_deposits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "reservation_id" "uuid" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "payment_method" "text" DEFAULT 'upi'::"text" NOT NULL,
    "reference" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reservation_deposits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "reservation_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reservation_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "phone" "text",
    "guests" integer DEFAULT 1 NOT NULL,
    "preferred_date" "date",
    "preferred_time" time without time zone,
    "notes" "text",
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "called_at" timestamp with time zone,
    "seated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reservation_waitlist" OWNER TO "postgres";


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
    "reservation_end_at" timestamp with time zone,
    "waitlist" boolean DEFAULT false,
    "deposit_amount" numeric DEFAULT 0,
    "occasion" "text",
    "vip" boolean DEFAULT false,
    "no_show" boolean DEFAULT false,
    "reminder_sent" boolean DEFAULT false
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_aggregator_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "outlet_code" "text",
    "active" boolean DEFAULT false NOT NULL,
    "menu_sync_enabled" boolean DEFAULT true NOT NULL,
    "order_sync_enabled" boolean DEFAULT true NOT NULL,
    "settlement_sync_enabled" boolean DEFAULT true NOT NULL,
    "last_menu_sync_at" timestamp with time zone,
    "last_order_sync_at" timestamp with time zone,
    "last_settlement_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_aggregator_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_approval_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "request_id" "uuid",
    "decision" "text" NOT NULL,
    "reason" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "restaurant_approval_decisions_decision_check" CHECK (("decision" = ANY (ARRAY['approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."restaurant_approval_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "reference_id" "uuid",
    "requested_by" "uuid",
    "approved_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reason" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone
);


ALTER TABLE "public"."restaurant_approval_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid",
    "image_url" "text",
    "sort_order" integer DEFAULT 4,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "address" "text",
    "phone" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_campaign_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "segment_id" "uuid",
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "audience_count" integer DEFAULT 0 NOT NULL,
    "delivered_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    CONSTRAINT "restaurant_campaign_runs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."restaurant_campaign_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_captain_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "table_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "offline" boolean DEFAULT false NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "restaurant_captain_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'ordering'::"text", 'kot_sent'::"text", 'billing'::"text", 'closed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."restaurant_captain_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_cash_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "shift_id" "uuid",
    "movement_type" "text" NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "reference" "text",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "restaurant_cash_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['cash_in'::"text", 'cash_out'::"text", 'sale'::"text", 'refund'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."restaurant_cash_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_cash_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "opened_by" "uuid",
    "opened_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "opening_cash" numeric DEFAULT 0,
    "expected_cash" numeric DEFAULT 0,
    "actual_cash" numeric,
    "difference" numeric,
    "status" "text" DEFAULT 'open'::"text",
    "notes" "text"
);


ALTER TABLE "public"."restaurant_cash_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "channel_code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_customer_segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_customer_segments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."restaurant_daily_payment_summary" AS
 SELECT "restaurant_id",
    ("date_trunc"('day'::"text", "paid_at"))::"date" AS "sale_date",
    "sum"(
        CASE
            WHEN (("payment_method" = 'cash'::"text") AND ("status" = 'paid'::"text")) THEN "amount"
            ELSE (0)::numeric
        END) AS "cash_sales",
    "sum"(
        CASE
            WHEN (("payment_method" = 'card'::"text") AND ("status" = 'paid'::"text")) THEN "amount"
            ELSE (0)::numeric
        END) AS "card_sales",
    "sum"(
        CASE
            WHEN (("payment_method" = 'upi'::"text") AND ("status" = 'paid'::"text")) THEN "amount"
            ELSE (0)::numeric
        END) AS "upi_sales",
    "sum"(
        CASE
            WHEN (("payment_method" <> ALL (ARRAY['cash'::"text", 'card'::"text", 'upi'::"text"])) AND ("status" = 'paid'::"text")) THEN "amount"
            ELSE (0)::numeric
        END) AS "other_sales",
    "sum"(
        CASE
            WHEN ("status" = 'paid'::"text") THEN "amount"
            ELSE (0)::numeric
        END) AS "total_paid",
    "sum"(
        CASE
            WHEN ("status" = 'refunded'::"text") THEN "amount"
            ELSE (0)::numeric
        END) AS "total_refunded"
   FROM "public"."order_payments"
  GROUP BY "restaurant_id", (("date_trunc"('day'::"text", "paid_at"))::"date");


ALTER VIEW "public"."restaurant_daily_payment_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "customer_name" "text",
    "phone" "text",
    "address" "text",
    "zone" "text",
    "delivery_charge" numeric DEFAULT 0,
    "rider_name" "text",
    "rider_phone" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "slip_no" "text",
    "order_mode" "text" DEFAULT 'delivery'::"text",
    "rider_id" "uuid",
    "payment_method" "text" DEFAULT 'cash'::"text",
    "expected_amount" numeric DEFAULT 0,
    "cash_collected" numeric DEFAULT 0,
    "upi_collected" numeric DEFAULT 0,
    "card_collected" numeric DEFAULT 0,
    "settlement_status" "text" DEFAULT 'pending'::"text",
    "settlement_difference" numeric DEFAULT 0,
    "assigned_at" timestamp with time zone,
    "out_for_delivery_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "settled_at" timestamp with time zone,
    "settled_by" "uuid",
    "customer_notes" "text",
    "delivery_person_type" "text" DEFAULT 'rider'::"text",
    "delivery_person_name" "text",
    "delivery_person_phone" "text",
    "collection_status" "text" DEFAULT 'not_required'::"text",
    "collection_expected" numeric(14,2) DEFAULT 0,
    "collection_received" numeric(14,2) DEFAULT 0,
    "collection_difference" numeric(14,2) DEFAULT 0,
    "collection_received_by" "uuid",
    "collection_received_at" timestamp with time zone,
    "collection_notes" "text",
    "settlement_method" "text"
);


ALTER TABLE "public"."restaurant_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_display_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "device_id" "uuid",
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_display_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_floor_maps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "floor_number" integer DEFAULT 1,
    "active" boolean DEFAULT true NOT NULL,
    "width" integer DEFAULT 1200,
    "height" integer DEFAULT 800,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_floor_maps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_hardware_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "device_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "location" "text",
    "active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "restaurant_hardware_devices_device_type_check" CHECK (("device_type" = ANY (ARRAY['printer'::"text", 'kds'::"text", 'display'::"text", 'kiosk'::"text", 'calling'::"text", 'cash_drawer'::"text", 'payment_terminal'::"text"])))
);


ALTER TABLE "public"."restaurant_hardware_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_integration_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "integration_code" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    CONSTRAINT "restaurant_integration_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'success'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."restaurant_integration_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "integration_type" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_kiosk_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "kiosk_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "language_code" "text" DEFAULT 'en'::"text",
    "cart" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "restaurant_kiosk_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'cart'::"text", 'payment'::"text", 'completed'::"text", 'cancelled'::"text", 'timeout'::"text"])))
);


ALTER TABLE "public"."restaurant_kiosk_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_loyalty_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "points" integer DEFAULT 0,
    "tier" "text" DEFAULT 'Silver'::"text",
    "lifetime_points" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_loyalty_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_loyalty_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "loyalty_account_id" "uuid" NOT NULL,
    "points" integer NOT NULL,
    "reason" "text",
    "order_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_loyalty_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_menu_publications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "channel_code" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_menu_publications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_menu_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "name" "text" DEFAULT 'Menu'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_at" timestamp with time zone,
    CONSTRAINT "restaurant_menu_versions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."restaurant_menu_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_offline_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "terminal_id" "uuid",
    "operation_type" "text" NOT NULL,
    "local_reference" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "synced_at" timestamp with time zone
);


ALTER TABLE "public"."restaurant_offline_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_payment_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "merchant_reference" "text",
    "active" boolean DEFAULT false NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_payment_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_payment_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "payment_method" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "instructions" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_payment_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_plugins" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid",
    "plugin_slug" "text",
    "enabled" boolean DEFAULT true,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "plugin_code" "text",
    "display_name" "text",
    "category" "text",
    "description" "text",
    "feature_kind" "text" DEFAULT 'feature'::"text",
    "activated_by" "uuid",
    "activated_at" timestamp with time zone,
    "disabled_at" timestamp with time zone
);


ALTER TABLE "public"."restaurant_plugins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_purchase_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_id" "uuid" NOT NULL,
    "inventory_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" numeric DEFAULT 0,
    "unit" "text",
    "unit_cost" numeric DEFAULT 0,
    "total" numeric GENERATED ALWAYS AS (("quantity" * "unit_cost")) STORED
);


ALTER TABLE "public"."restaurant_purchase_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "invoice_number" "text",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "subtotal" numeric DEFAULT 0,
    "tax" numeric DEFAULT 0,
    "total" numeric DEFAULT 0,
    "paid" numeric DEFAULT 0,
    "notes" "text",
    "purchase_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_recipe_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "inventory_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "unit" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_recipe_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "yield_qty" numeric DEFAULT 1,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_report_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "report_id" "uuid",
    "report_type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "file_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "restaurant_report_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."restaurant_report_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_reservation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "reservation_id" "uuid",
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_reservation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_service_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "table_id" "uuid",
    "call_type" "text" DEFAULT 'waiter'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    CONSTRAINT "restaurant_service_calls_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text", 'resolved'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."restaurant_service_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_staff_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "staff_name" "text",
    "shift_date" "date" DEFAULT CURRENT_DATE,
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "status" "text" DEFAULT 'scheduled'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_staff_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "billing_cycle" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "saas_plan_id" "uuid",
    CONSTRAINT "restaurant_subscriptions_active_requires_plan" CHECK ((("status" <> 'active'::"text") OR ("saas_plan_id" IS NOT NULL))),
    CONSTRAINT "restaurant_subscriptions_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "restaurant_subscriptions_dates_check" CHECK ((("expires_at" IS NULL) OR ("expires_at" >= "starts_at"))),
    CONSTRAINT "restaurant_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'trial'::"text", 'active'::"text", 'past_due'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."restaurant_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "gst_number" "text",
    "payment_terms" "text",
    "opening_balance" numeric DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_table_layouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "table_id" "uuid",
    "floor_map_id" "uuid",
    "x" numeric(10,2) DEFAULT 40,
    "y" numeric(10,2) DEFAULT 40,
    "width" numeric(10,2) DEFAULT 100,
    "height" numeric(10,2) DEFAULT 70,
    "rotation" numeric(10,2) DEFAULT 0,
    "z_index" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_table_layouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_terminals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "terminal_name" "text" NOT NULL,
    "device_type" "text" DEFAULT 'pos'::"text" NOT NULL,
    "terminal_code" "text",
    "active" boolean DEFAULT true NOT NULL,
    "offline_enabled" boolean DEFAULT true NOT NULL,
    "printer_enabled" boolean DEFAULT false NOT NULL,
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_terminals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_virtual_brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "menu_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "channel_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_virtual_brands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_website_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "slug" "text",
    "domain" "text",
    "enabled" boolean DEFAULT false NOT NULL,
    "seo_title" "text",
    "seo_description" "text",
    "whatsapp_number" "text",
    "theme" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sections" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_website_settings" OWNER TO "postgres";


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
    "theme_config" "jsonb",
    "gst_number" "text",
    "service_charge_enabled" boolean DEFAULT false,
    "service_charge_percent" numeric DEFAULT 0,
    "default_tax_percent" numeric DEFAULT 0,
    "delivery_enabled" boolean DEFAULT false,
    "tip_enabled" boolean DEFAULT true,
    "min_delivery_order" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'INR'::"text"
);


ALTER TABLE "public"."restaurants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."restaurants"."theme_config" IS 'White-label POS theme selection and generated brand theme presets.';



CREATE TABLE IF NOT EXISTS "public"."review_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "feedback_id" "uuid",
    "reply" "text" NOT NULL,
    "replied_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."review_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "permission" "text" NOT NULL,
    "allowed" boolean DEFAULT true
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "room_number" smallint,
    "restaurant_id" "uuid"
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "monthly_price" numeric(14,2) DEFAULT 0 NOT NULL,
    "yearly_price" numeric(14,2) DEFAULT 0 NOT NULL,
    "max_users" integer,
    "max_tables" integer,
    "qr_ordering" boolean DEFAULT true NOT NULL,
    "loyalty" boolean DEFAULT false NOT NULL,
    "offers" boolean DEFAULT false NOT NULL,
    "analytics" boolean DEFAULT false NOT NULL,
    "reservations" boolean DEFAULT false NOT NULL,
    "whatsapp" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saas_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scan_pay_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "amount" numeric DEFAULT 0 NOT NULL,
    "payment_method" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reference" "text",
    "expires_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scan_pay_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."self_service_kiosks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "kiosk_code" "text",
    "active" boolean DEFAULT true NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."self_service_kiosks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "gst_enabled" boolean DEFAULT true,
    "gst_rate" numeric DEFAULT 5,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sms_campaign_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "customer_id" "uuid",
    "phone" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "provider_message_id" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sms_campaign_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "clock_in" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clock_out" timestamp with time zone,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."staff_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_attendance_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "event_type" "text" NOT NULL,
    "at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."staff_attendance_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_breaks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    "notes" "text"
);


ALTER TABLE "public"."staff_breaks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_pay_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "salary" numeric DEFAULT 0,
    "commission_percent" numeric DEFAULT 0,
    "overtime_rate" numeric DEFAULT 0,
    "effective_from" "date" DEFAULT CURRENT_DATE
);


ALTER TABLE "public"."staff_pay_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."staff_permissions" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."supplier_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "amount" numeric DEFAULT 0,
    "payment_method" "text" DEFAULT 'cash'::"text",
    "reference" "text",
    "paid_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."supplier_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."table_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "opened_by" "uuid",
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "guest_count" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL
);


ALTER TABLE "public"."table_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "table_number" smallint,
    "restaurant_id" "uuid",
    "seats" integer DEFAULT 4,
    "floor" "text" DEFAULT 'Ground Floor'::"text",
    "section" "text" DEFAULT 'Main'::"text",
    "shape" "text" DEFAULT 'rectangle'::"text",
    "position_x" numeric DEFAULT 0,
    "position_y" numeric DEFAULT 0,
    "status" "text" DEFAULT 'available'::"text",
    "waiter_id" "uuid",
    "qr_enabled" boolean DEFAULT true
);


ALTER TABLE "public"."tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "role" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."website_order_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "slug" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."website_order_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."aggregator_integrations"
    ADD CONSTRAINT "aggregator_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aggregator_integrations"
    ADD CONSTRAINT "aggregator_integrations_restaurant_id_provider_key" UNIQUE ("restaurant_id", "provider");



ALTER TABLE ONLY "public"."aggregator_menu_controls"
    ADD CONSTRAINT "aggregator_menu_controls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aggregator_menu_controls"
    ADD CONSTRAINT "aggregator_menu_controls_restaurant_id_channel_code_menu_it_key" UNIQUE ("restaurant_id", "channel_code", "menu_item_id");



ALTER TABLE ONLY "public"."aggregator_orders"
    ADD CONSTRAINT "aggregator_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aggregator_orders"
    ADD CONSTRAINT "aggregator_orders_restaurant_id_provider_external_order_id_key" UNIQUE ("restaurant_id", "provider", "external_order_id");



ALTER TABLE ONLY "public"."aggregator_payouts"
    ADD CONSTRAINT "aggregator_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aggregator_settlements"
    ADD CONSTRAINT "aggregator_settlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aggregator_sync_jobs"
    ADD CONSTRAINT "aggregator_sync_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branch_inventory_balances"
    ADD CONSTRAINT "branch_inventory_balances_branch_id_inventory_id_key" UNIQUE ("branch_id", "inventory_id");



ALTER TABLE ONLY "public"."branch_inventory_balances"
    ADD CONSTRAINT "branch_inventory_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branch_menu_overrides"
    ADD CONSTRAINT "branch_menu_overrides_branch_id_menu_item_id_key" UNIQUE ("branch_id", "menu_item_id");



ALTER TABLE ONLY "public"."branch_menu_overrides"
    ADD CONSTRAINT "branch_menu_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calling_devices"
    ADD CONSTRAINT "calling_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calling_requests"
    ADD CONSTRAINT "calling_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."captain_sessions"
    ADD CONSTRAINT "captain_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_restaurant_id_business_date_key" UNIQUE ("restaurant_id", "business_date");



ALTER TABLE ONLY "public"."cash_movements"
    ADD CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_shifts"
    ADD CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."central_kitchens"
    ADD CONSTRAINT "central_kitchens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."central_kitchens"
    ADD CONSTRAINT "central_kitchens_restaurant_id_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."customer_feedback"
    ADD CONSTRAINT "customer_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_memberships"
    ADD CONSTRAINT "customer_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_preferences"
    ADD CONSTRAINT "customer_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_preferences"
    ADD CONSTRAINT "customer_preferences_restaurant_id_customer_id_key" UNIQUE ("restaurant_id", "customer_id");



ALTER TABLE ONLY "public"."customer_segment_members"
    ADD CONSTRAINT "customer_segment_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_segment_members"
    ADD CONSTRAINT "customer_segment_members_segment_id_customer_id_key" UNIQUE ("segment_id", "customer_id");



ALTER TABLE ONLY "public"."customer_segments"
    ADD CONSTRAINT "customer_segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_segments"
    ADD CONSTRAINT "customer_segments_restaurant_id_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."customer_wallet_transactions"
    ADD CONSTRAINT "customer_wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_wallets"
    ADD CONSTRAINT "customer_wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_wallets"
    ADD CONSTRAINT "customer_wallets_restaurant_id_customer_id_key" UNIQUE ("restaurant_id", "customer_id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_assignments"
    ADD CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_events"
    ADD CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_otps"
    ADD CONSTRAINT "delivery_otps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_riders"
    ADD CONSTRAINT "delivery_riders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_settlements"
    ADD CONSTRAINT "delivery_settlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_zones"
    ADD CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digital_display_calls"
    ADD CONSTRAINT "digital_display_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digital_display_playlists"
    ADD CONSTRAINT "digital_display_playlists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dining_tables"
    ADD CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dining_tables"
    ADD CONSTRAINT "dining_tables_restaurant_id_table_no_key" UNIQUE ("restaurant_id", "table_no");



ALTER TABLE ONLY "public"."discount_rules"
    ADD CONSTRAINT "discount_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_rules"
    ADD CONSTRAINT "discount_rules_restaurant_id_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."dynamic_report_definitions"
    ADD CONSTRAINT "dynamic_report_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."e_bill_documents"
    ADD CONSTRAINT "e_bill_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_requests"
    ADD CONSTRAINT "feedback_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_requests"
    ADD CONSTRAINT "feedback_requests_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."food_cost_snapshots"
    ADD CONSTRAINT "food_cost_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_snapshots"
    ADD CONSTRAINT "forecast_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forecast_snapshots"
    ADD CONSTRAINT "forecast_snapshots_restaurant_id_forecast_date_metric_key" UNIQUE ("restaurant_id", "forecast_date", "metric");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_batches"
    ADD CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_transfers"
    ADD CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_wastage"
    ADD CONSTRAINT "inventory_wastage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_sequences"
    ADD CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("restaurant_id");



ALTER TABLE ONLY "public"."item_ingredients"
    ADD CONSTRAINT "item_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kds_events"
    ADD CONSTRAINT "kds_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_dispatches"
    ADD CONSTRAINT "kitchen_dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_order_tickets"
    ADD CONSTRAINT "kitchen_order_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_stations"
    ADD CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kot_routes"
    ADD CONSTRAINT "kot_routes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kot_tickets"
    ADD CONSTRAINT "kot_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_campaigns"
    ADD CONSTRAINT "loyalty_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_redemptions"
    ADD CONSTRAINT "loyalty_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_referrals"
    ADD CONSTRAINT "loyalty_referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_referrals"
    ADD CONSTRAINT "loyalty_referrals_restaurant_id_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_restaurant_id_name_key" UNIQUE ("restaurant_id", "name");



ALTER TABLE ONLY "public"."loyalty_settings"
    ADD CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("restaurant_id");



ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_restaurant_id_name_key" UNIQUE ("restaurant_id", "name");



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_item_modifier_groups"
    ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_modifier_group_id_key" UNIQUE ("menu_item_id", "modifier_group_id");



ALTER TABLE ONLY "public"."menu_item_modifier_groups"
    ADD CONSTRAINT "menu_item_modifier_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_variants"
    ADD CONSTRAINT "menu_variants_menu_item_id_name_key" UNIQUE ("menu_item_id", "name");



ALTER TABLE ONLY "public"."menu_variants"
    ADD CONSTRAINT "menu_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_queue"
    ADD CONSTRAINT "message_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modifier_groups"
    ADD CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modifiers"
    ADD CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offer_products"
    ADD CONSTRAINT "offer_products_pkey" PRIMARY KEY ("offer_id", "menu_item_id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offline_pos_events"
    ADD CONSTRAINT "offline_pos_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offline_pos_events"
    ADD CONSTRAINT "offline_pos_events_restaurant_id_client_event_id_key" UNIQUE ("restaurant_id", "client_event_id");



ALTER TABLE ONLY "public"."online_channels"
    ADD CONSTRAINT "online_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."online_channels"
    ADD CONSTRAINT "online_channels_restaurant_id_channel_code_key" UNIQUE ("restaurant_id", "channel_code");



ALTER TABLE ONLY "public"."online_order_reconciliations"
    ADD CONSTRAINT "online_order_reconciliations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_discount_applications"
    ADD CONSTRAINT "order_discount_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_holds"
    ADD CONSTRAINT "order_holds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_item_modifiers"
    ADD CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_item_moves"
    ADD CONSTRAINT "order_item_moves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_payments"
    ADD CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_refunds"
    ADD CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_split_items"
    ADD CONSTRAINT "order_split_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_splits"
    ADD CONSTRAINT "order_splits_order_id_split_no_key" UNIQUE ("order_id", "split_no");



ALTER TABLE ONLY "public"."order_splits"
    ADD CONSTRAINT "order_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_tokens"
    ADD CONSTRAINT "order_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_tokens"
    ADD CONSTRAINT "order_tokens_restaurant_id_token_date_token_no_key" UNIQUE ("restaurant_id", "token_date", "token_no");



ALTER TABLE ONLY "public"."order_transfers"
    ADD CONSTRAINT "order_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_gateway_configs"
    ADD CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_gateway_configs"
    ADD CONSTRAINT "payment_gateway_configs_restaurant_id_provider_key" UNIQUE ("restaurant_id", "provider");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_provider_event_id_key" UNIQUE ("provider", "event_id");



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_unique" UNIQUE ("plan_id", "plugin_code");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plugin_catalog"
    ADD CONSTRAINT "plugin_catalog_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."plugin_logs"
    ADD CONSTRAINT "plugin_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plugin_settings"
    ADD CONSTRAINT "plugin_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plugins"
    ADD CONSTRAINT "plugins_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."plugins"
    ADD CONSTRAINT "plugins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_audit_events"
    ADD CONSTRAINT "pos_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_terminals"
    ADD CONSTRAINT "pos_terminals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_terminals"
    ADD CONSTRAINT "pos_terminals_restaurant_id_terminal_code_key" UNIQUE ("restaurant_id", "terminal_code");



ALTER TABLE ONLY "public"."print_jobs"
    ADD CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."printer_devices"
    ADD CONSTRAINT "printer_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_customer_id_key" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_restaurant_id_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_exports"
    ADD CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_schedules"
    ADD CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservation_deposits"
    ADD CONSTRAINT "reservation_deposits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservation_reminders"
    ADD CONSTRAINT "reservation_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservation_waitlist"
    ADD CONSTRAINT "reservation_waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_aggregator_accounts"
    ADD CONSTRAINT "restaurant_aggregator_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_aggregator_accounts"
    ADD CONSTRAINT "restaurant_aggregator_accounts_restaurant_id_provider_key" UNIQUE ("restaurant_id", "provider");



ALTER TABLE ONLY "public"."restaurant_approval_decisions"
    ADD CONSTRAINT "restaurant_approval_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_approval_requests"
    ADD CONSTRAINT "restaurant_approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_areas"
    ADD CONSTRAINT "restaurant_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_areas"
    ADD CONSTRAINT "restaurant_areas_restaurant_id_name_key" UNIQUE ("restaurant_id", "name");



ALTER TABLE ONLY "public"."restaurant_banners"
    ADD CONSTRAINT "restaurant_banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_branches"
    ADD CONSTRAINT "restaurant_branches_parent_restaurant_id_code_key" UNIQUE ("parent_restaurant_id", "code");



ALTER TABLE ONLY "public"."restaurant_branches"
    ADD CONSTRAINT "restaurant_branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_campaign_runs"
    ADD CONSTRAINT "restaurant_campaign_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_captain_sessions"
    ADD CONSTRAINT "restaurant_captain_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_cash_movements"
    ADD CONSTRAINT "restaurant_cash_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_cash_sessions"
    ADD CONSTRAINT "restaurant_cash_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_channels"
    ADD CONSTRAINT "restaurant_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_channels"
    ADD CONSTRAINT "restaurant_channels_restaurant_id_channel_code_key" UNIQUE ("restaurant_id", "channel_code");



ALTER TABLE ONLY "public"."restaurant_customer_segments"
    ADD CONSTRAINT "restaurant_customer_segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_customer_segments"
    ADD CONSTRAINT "restaurant_customer_segments_restaurant_id_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."restaurant_deliveries"
    ADD CONSTRAINT "restaurant_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_display_events"
    ADD CONSTRAINT "restaurant_display_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_floor_maps"
    ADD CONSTRAINT "restaurant_floor_maps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_hardware_devices"
    ADD CONSTRAINT "restaurant_hardware_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_integration_jobs"
    ADD CONSTRAINT "restaurant_integration_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_integrations"
    ADD CONSTRAINT "restaurant_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_integrations"
    ADD CONSTRAINT "restaurant_integrations_restaurant_id_integration_type_prov_key" UNIQUE ("restaurant_id", "integration_type", "provider");



ALTER TABLE ONLY "public"."restaurant_kiosk_sessions"
    ADD CONSTRAINT "restaurant_kiosk_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_loyalty_accounts"
    ADD CONSTRAINT "restaurant_loyalty_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_loyalty_accounts"
    ADD CONSTRAINT "restaurant_loyalty_accounts_restaurant_id_customer_id_key" UNIQUE ("restaurant_id", "customer_id");



ALTER TABLE ONLY "public"."restaurant_loyalty_transactions"
    ADD CONSTRAINT "restaurant_loyalty_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_menu_publications"
    ADD CONSTRAINT "restaurant_menu_publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_menu_versions"
    ADD CONSTRAINT "restaurant_menu_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_offline_queue"
    ADD CONSTRAINT "restaurant_offline_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_payment_accounts"
    ADD CONSTRAINT "restaurant_payment_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_payment_accounts"
    ADD CONSTRAINT "restaurant_payment_accounts_restaurant_id_provider_display__key" UNIQUE ("restaurant_id", "provider", "display_name");



ALTER TABLE ONLY "public"."restaurant_payment_settings"
    ADD CONSTRAINT "restaurant_payment_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_payment_settings"
    ADD CONSTRAINT "restaurant_payment_settings_restaurant_id_payment_method_key" UNIQUE ("restaurant_id", "payment_method");



ALTER TABLE ONLY "public"."restaurant_plugins"
    ADD CONSTRAINT "restaurant_plugins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_purchase_items"
    ADD CONSTRAINT "restaurant_purchase_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_purchases"
    ADD CONSTRAINT "restaurant_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_recipe_items"
    ADD CONSTRAINT "restaurant_recipe_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_recipes"
    ADD CONSTRAINT "restaurant_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_recipes"
    ADD CONSTRAINT "restaurant_recipes_restaurant_id_menu_item_id_key" UNIQUE ("restaurant_id", "menu_item_id");



ALTER TABLE ONLY "public"."restaurant_report_runs"
    ADD CONSTRAINT "restaurant_report_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_reservation_events"
    ADD CONSTRAINT "restaurant_reservation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_service_calls"
    ADD CONSTRAINT "restaurant_service_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_staff_shifts"
    ADD CONSTRAINT "restaurant_staff_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_subscriptions"
    ADD CONSTRAINT "restaurant_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_suppliers"
    ADD CONSTRAINT "restaurant_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_table_layouts"
    ADD CONSTRAINT "restaurant_table_layouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_terminals"
    ADD CONSTRAINT "restaurant_terminals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_terminals"
    ADD CONSTRAINT "restaurant_terminals_restaurant_id_terminal_name_key" UNIQUE ("restaurant_id", "terminal_name");



ALTER TABLE ONLY "public"."restaurant_virtual_brands"
    ADD CONSTRAINT "restaurant_virtual_brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_virtual_brands"
    ADD CONSTRAINT "restaurant_virtual_brands_restaurant_id_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."restaurant_website_settings"
    ADD CONSTRAINT "restaurant_website_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_website_settings"
    ADD CONSTRAINT "restaurant_website_settings_restaurant_id_key" UNIQUE ("restaurant_id");



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_replies"
    ADD CONSTRAINT "review_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_restaurant_id_role_permission_key" UNIQUE ("restaurant_id", "role", "permission");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saas_plans"
    ADD CONSTRAINT "saas_plans_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."saas_plans"
    ADD CONSTRAINT "saas_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scan_pay_requests"
    ADD CONSTRAINT "scan_pay_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."self_service_kiosks"
    ADD CONSTRAINT "self_service_kiosks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."sms_campaign_deliveries"
    ADD CONSTRAINT "sms_campaign_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_attendance_events"
    ADD CONSTRAINT "staff_attendance_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_attendance"
    ADD CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_breaks"
    ADD CONSTRAINT "staff_breaks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_pay_rules"
    ADD CONSTRAINT "staff_pay_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_permissions"
    ADD CONSTRAINT "staff_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_permissions"
    ADD CONSTRAINT "staff_permissions_restaurant_id_staff_id_permission_key_key" UNIQUE ("restaurant_id", "staff_id", "permission_key");



ALTER TABLE ONLY "public"."stock_usage"
    ADD CONSTRAINT "stock_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plugins"
    ADD CONSTRAINT "unique_plugin_per_restaurant" UNIQUE ("restaurant_id", "plugin_slug");



ALTER TABLE ONLY "public"."plugin_settings"
    ADD CONSTRAINT "unique_plugin_setting" UNIQUE ("restaurant_id", "plugin_code");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."website_order_settings"
    ADD CONSTRAINT "website_order_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."website_order_settings"
    ADD CONSTRAINT "website_order_settings_restaurant_id_key" UNIQUE ("restaurant_id");



CREATE INDEX "idx_aggregator_orders_restaurant" ON "public"."aggregator_orders" USING "btree" ("restaurant_id", "provider", "received_at" DESC);



CREATE INDEX "idx_aggregator_payouts_restaurant_date" ON "public"."aggregator_payouts" USING "btree" ("restaurant_id", "payout_date" DESC);



CREATE INDEX "idx_approval_decisions_restaurant" ON "public"."restaurant_approval_decisions" USING "btree" ("restaurant_id", "decided_at" DESC);



CREATE INDEX "idx_approvals_restaurant" ON "public"."restaurant_approval_requests" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_attendance_restaurant_date" ON "public"."staff_attendance" USING "btree" ("restaurant_id", "clock_in" DESC);



CREATE INDEX "idx_attendance_staff" ON "public"."staff_attendance" USING "btree" ("staff_id", "clock_in" DESC);



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "idx_audit_logs_restaurant_created" ON "public"."audit_logs" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_audit_restaurant" ON "public"."audit_logs" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_branch_menu_overrides_branch" ON "public"."branch_menu_overrides" USING "btree" ("branch_id", "menu_item_id");



CREATE INDEX "idx_calling_requests_restaurant" ON "public"."calling_requests" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_campaign_runs_restaurant" ON "public"."restaurant_campaign_runs" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_captain_sessions_restaurant" ON "public"."restaurant_captain_sessions" USING "btree" ("restaurant_id", "status", "started_at" DESC);



CREATE INDEX "idx_cash_closing_restaurant" ON "public"."cash_closings" USING "btree" ("restaurant_id", "business_date" DESC);



CREATE INDEX "idx_cash_movements_restaurant" ON "public"."restaurant_cash_movements" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_cash_movements_session" ON "public"."cash_movements" USING "btree" ("session_id");



CREATE INDEX "idx_cash_shifts_restaurant" ON "public"."cash_shifts" USING "btree" ("restaurant_id", "status", "opened_at" DESC);



CREATE INDEX "idx_central_kitchens_restaurant" ON "public"."central_kitchens" USING "btree" ("restaurant_id");



CREATE INDEX "idx_channels_restaurant" ON "public"."restaurant_channels" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_customer_memberships_customer" ON "public"."customer_memberships" USING "btree" ("customer_id");



CREATE INDEX "idx_customers_restaurant_name" ON "public"."customers" USING "btree" ("restaurant_id", "name");



CREATE INDEX "idx_delivery_assignments_order" ON "public"."delivery_assignments" USING "btree" ("order_id");



CREATE INDEX "idx_delivery_assignments_rider" ON "public"."delivery_assignments" USING "btree" ("rider_id", "status");



CREATE INDEX "idx_delivery_events_delivery" ON "public"."delivery_events" USING "btree" ("delivery_id");



CREATE INDEX "idx_delivery_settlements_restaurant_date" ON "public"."delivery_settlements" USING "btree" ("restaurant_id", "settlement_date" DESC);



CREATE INDEX "idx_delivery_zones_restaurant_active_name" ON "public"."delivery_zones" USING "btree" ("restaurant_id", "active", "name");



CREATE INDEX "idx_delivery_zones_restaurant_name" ON "public"."delivery_zones" USING "btree" ("restaurant_id", "name");



CREATE INDEX "idx_dining_tables_restaurant" ON "public"."dining_tables" USING "btree" ("restaurant_id", "area_id", "status");



CREATE INDEX "idx_discount_rules_restaurant" ON "public"."discount_rules" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_dynamic_reports_restaurant" ON "public"."dynamic_report_definitions" USING "btree" ("restaurant_id", "updated_at" DESC);



CREATE INDEX "idx_ebill_documents_restaurant" ON "public"."e_bill_documents" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_expenses_restaurant_date" ON "public"."expenses" USING "btree" ("restaurant_id", "expense_date" DESC);



CREATE INDEX "idx_feedback_requests_restaurant" ON "public"."feedback_requests" USING "btree" ("restaurant_id", "status");



CREATE INDEX "idx_feedback_restaurant_created" ON "public"."customer_feedback" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_floor_maps_restaurant" ON "public"."restaurant_floor_maps" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_forecast_snapshots_restaurant" ON "public"."forecast_snapshots" USING "btree" ("restaurant_id", "forecast_date" DESC);



CREATE INDEX "idx_integration_jobs_restaurant" ON "public"."restaurant_integration_jobs" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_integrations_restaurant" ON "public"."restaurant_integrations" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_inventory_batches_expiry" ON "public"."inventory_batches" USING "btree" ("expiry_date");



CREATE INDEX "idx_inventory_movements_restaurant" ON "public"."inventory_movements" USING "btree" ("restaurant_id");



CREATE INDEX "idx_inventory_restaurant_id" ON "public"."inventory" USING "btree" ("restaurant_id");



CREATE INDEX "idx_inventory_tx_inventory_created" ON "public"."inventory_transactions" USING "btree" ("inventory_id", "created_at" DESC);



CREATE INDEX "idx_inventory_tx_restaurant_created" ON "public"."inventory_transactions" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_kds_events_restaurant" ON "public"."kds_events" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_kiosk_sessions_restaurant" ON "public"."restaurant_kiosk_sessions" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_kitchen_dispatches_restaurant" ON "public"."kitchen_dispatches" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_kitchen_order_tickets_restaurant_order" ON "public"."kitchen_order_tickets" USING "btree" ("restaurant_id", "order_id");



CREATE INDEX "idx_kitchen_tickets_order" ON "public"."kitchen_order_tickets" USING "btree" ("order_id");



CREATE INDEX "idx_kot_order" ON "public"."kot_tickets" USING "btree" ("order_id");



CREATE INDEX "idx_kot_restaurant_created" ON "public"."kot_tickets" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_kot_restaurant_status" ON "public"."kot_tickets" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_kot_routes_restaurant" ON "public"."kot_routes" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_loyalty_campaigns_restaurant" ON "public"."loyalty_campaigns" USING "btree" ("restaurant_id", "active", "starts_at");



CREATE INDEX "idx_loyalty_customer" ON "public"."loyalty_transactions" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "idx_loyalty_redemptions_customer" ON "public"."loyalty_redemptions" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "idx_loyalty_referrals_restaurant" ON "public"."loyalty_referrals" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_loyalty_rewards_restaurant" ON "public"."loyalty_rewards" USING "btree" ("restaurant_id", "active", "points_cost");



CREATE INDEX "idx_loyalty_tiers_restaurant" ON "public"."loyalty_tiers" USING "btree" ("restaurant_id", "min_points" DESC);



CREATE INDEX "idx_loyalty_transactions_order_type" ON "public"."loyalty_transactions" USING "btree" ("order_id", "transaction_type");



CREATE INDEX "idx_menu_item_modifier_groups_item" ON "public"."menu_item_modifier_groups" USING "btree" ("restaurant_id", "menu_item_id");



CREATE INDEX "idx_menu_items_restaurant_id" ON "public"."menu_items" USING "btree" ("restaurant_id");



CREATE INDEX "idx_menu_items_restaurant_name" ON "public"."menu_items" USING "btree" ("restaurant_id", "name");



CREATE INDEX "idx_menu_items_restaurant_type" ON "public"."menu_items" USING "btree" ("restaurant_id", "item_type");



CREATE INDEX "idx_menu_publications_restaurant" ON "public"."restaurant_menu_publications" USING "btree" ("restaurant_id", "channel_code", "created_at" DESC);



CREATE INDEX "idx_menu_variants_item" ON "public"."menu_variants" USING "btree" ("menu_item_id", "active");



CREATE INDEX "idx_message_queue_restaurant" ON "public"."message_queue" USING "btree" ("restaurant_id", "status", "created_at");



CREATE INDEX "idx_modifier_groups_restaurant" ON "public"."modifier_groups" USING "btree" ("restaurant_id");



CREATE INDEX "idx_modifiers_group" ON "public"."modifiers" USING "btree" ("group_id");



CREATE INDEX "idx_notifications_restaurant_created_at" ON "public"."notifications" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_offer_products_menu_item" ON "public"."offer_products" USING "btree" ("menu_item_id");



CREATE INDEX "idx_offers_coupon" ON "public"."offers" USING "btree" ("restaurant_id", "lower"("coupon_code"));



CREATE INDEX "idx_offers_restaurant_active_dates" ON "public"."offers" USING "btree" ("restaurant_id", "active", "valid_from", "valid_till");



CREATE INDEX "idx_offers_restaurant_id" ON "public"."offers" USING "btree" ("restaurant_id");



CREATE INDEX "idx_offers_restaurant_title" ON "public"."offers" USING "btree" ("restaurant_id", "title");



CREATE INDEX "idx_offers_schedule" ON "public"."offers" USING "btree" ("restaurant_id", "active", "valid_from", "valid_till", "priority" DESC);



CREATE INDEX "idx_offers_targeting" ON "public"."offers" USING "btree" ("restaurant_id", "target_type", "active");



CREATE INDEX "idx_offline_pos_events_restaurant" ON "public"."offline_pos_events" USING "btree" ("restaurant_id", "status", "created_at");



CREATE INDEX "idx_offline_queue_restaurant" ON "public"."restaurant_offline_queue" USING "btree" ("restaurant_id", "status", "queued_at");



CREATE UNIQUE INDEX "idx_one_active_subscription_per_restaurant" ON "public"."restaurant_subscriptions" USING "btree" ("restaurant_id") WHERE ("status" = ANY (ARRAY['trial'::"text", 'active'::"text"]));



CREATE INDEX "idx_online_reconciliation" ON "public"."online_order_reconciliations" USING "btree" ("restaurant_id", "channel_code", "order_date" DESC);



CREATE INDEX "idx_order_discount_applications_order" ON "public"."order_discount_applications" USING "btree" ("order_id");



CREATE INDEX "idx_order_holds_order" ON "public"."order_holds" USING "btree" ("order_id");



CREATE INDEX "idx_order_item_modifiers_order_item" ON "public"."order_item_modifiers" USING "btree" ("order_item_id");



CREATE INDEX "idx_order_item_moves_order" ON "public"."order_item_moves" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_item_id" ON "public"."order_items" USING "btree" ("item_id");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_payments_order" ON "public"."order_payments" USING "btree" ("order_id");



CREATE INDEX "idx_order_payments_order_status_created" ON "public"."order_payments" USING "btree" ("order_id", "status", "created_at" DESC);



CREATE INDEX "idx_order_payments_restaurant" ON "public"."order_payments" USING "btree" ("restaurant_id");



CREATE INDEX "idx_order_payments_restaurant_status_created" ON "public"."order_payments" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_order_refunds_order" ON "public"."order_refunds" USING "btree" ("order_id");



CREATE INDEX "idx_order_refunds_order_status" ON "public"."order_refunds" USING "btree" ("order_id", "status");



CREATE INDEX "idx_order_splits_order" ON "public"."order_splits" USING "btree" ("order_id");



CREATE INDEX "idx_order_status_history_order" ON "public"."order_status_history" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "idx_order_tokens_board" ON "public"."order_tokens" USING "btree" ("restaurant_id", "token_date", "status", "token_no");



CREATE INDEX "idx_order_transfers_order" ON "public"."order_transfers" USING "btree" ("order_id");



CREATE INDEX "idx_orders_customer_id" ON "public"."orders" USING "btree" ("customer_id");



CREATE INDEX "idx_orders_delivery_charge" ON "public"."orders" USING "btree" ("restaurant_id", "order_mode", "delivery_charge");



CREATE INDEX "idx_orders_restaurant_billed_at" ON "public"."orders" USING "btree" ("restaurant_id", "billed_at" DESC);



CREATE INDEX "idx_orders_restaurant_created_at" ON "public"."orders" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_orders_restaurant_customer" ON "public"."orders" USING "btree" ("restaurant_id", "customer_id");



CREATE INDEX "idx_orders_restaurant_id" ON "public"."orders" USING "btree" ("restaurant_id");



CREATE INDEX "idx_orders_restaurant_invoice" ON "public"."orders" USING "btree" ("restaurant_id", "invoice_no");



CREATE INDEX "idx_orders_restaurant_status_created" ON "public"."orders" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_orders_source" ON "public"."orders" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_payment_accounts_restaurant" ON "public"."restaurant_payment_accounts" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_payment_accounts_restaurant_active" ON "public"."restaurant_payment_accounts" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_payment_gateway_configs_restaurant" ON "public"."payment_gateway_configs" USING "btree" ("restaurant_id");



CREATE INDEX "idx_payment_settings_restaurant" ON "public"."restaurant_payment_settings" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plan_features_plan" ON "public"."plan_features" USING "btree" ("plan_id");



CREATE INDEX "idx_plan_features_plugin" ON "public"."plan_features" USING "btree" ("plugin_code");



CREATE INDEX "idx_plans_active" ON "public"."plans" USING "btree" ("is_active");



CREATE INDEX "idx_plugin_logs_restaurant_id" ON "public"."plugin_logs" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugin_restaurant" ON "public"."plugin_settings" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugin_settings_restaurant_id" ON "public"."plugin_settings" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugins_restaurant" ON "public"."plugins" USING "btree" ("restaurant_id");



CREATE INDEX "idx_plugins_slug" ON "public"."plugins" USING "btree" ("plugin_slug");



CREATE INDEX "idx_pos_audit_restaurant" ON "public"."pos_audit_events" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_print_jobs_restaurant" ON "public"."print_jobs" USING "btree" ("restaurant_id", "status", "created_at");



CREATE INDEX "idx_printer_devices_restaurant" ON "public"."printer_devices" USING "btree" ("restaurant_id");



CREATE INDEX "idx_profiles_restaurant_id" ON "public"."profiles" USING "btree" ("restaurant_id");



CREATE INDEX "idx_purchase_orders_restaurant" ON "public"."purchase_orders" USING "btree" ("restaurant_id");



CREATE INDEX "idx_report_exports_restaurant" ON "public"."report_exports" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_report_runs_restaurant" ON "public"."restaurant_report_runs" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_reservations_restaurant_created_at" ON "public"."reservations" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_reservations_restaurant_id" ON "public"."reservations" USING "btree" ("restaurant_id");



CREATE INDEX "idx_reservations_restaurant_table_time" ON "public"."reservations" USING "btree" ("restaurant_id", "table_id", "reservation_start_at", "reservation_end_at");



CREATE INDEX "idx_restaurant_banners_restaurant_id" ON "public"."restaurant_banners" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_cash_sessions_restaurant" ON "public"."restaurant_cash_sessions" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_deliveries_collection" ON "public"."restaurant_deliveries" USING "btree" ("restaurant_id", "collection_status", "created_at" DESC);



CREATE INDEX "idx_restaurant_deliveries_person" ON "public"."restaurant_deliveries" USING "btree" ("restaurant_id", "delivery_person_type", "status");



CREATE INDEX "idx_restaurant_deliveries_restaurant" ON "public"."restaurant_deliveries" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_deliveries_rider" ON "public"."restaurant_deliveries" USING "btree" ("restaurant_id", "rider_id", "status");



CREATE INDEX "idx_restaurant_deliveries_slip" ON "public"."restaurant_deliveries" USING "btree" ("restaurant_id", "slip_no");



CREATE INDEX "idx_restaurant_deliveries_status" ON "public"."restaurant_deliveries" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_restaurant_loyalty_restaurant" ON "public"."restaurant_loyalty_accounts" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_plugins_control" ON "public"."restaurant_plugins" USING "btree" ("restaurant_id", "plugin_code", "enabled");



CREATE INDEX "idx_restaurant_plugins_feature" ON "public"."restaurant_plugins" USING "btree" ("restaurant_id", "plugin_code", "enabled");



CREATE INDEX "idx_restaurant_plugins_hub_controls" ON "public"."restaurant_plugins" USING "btree" ("restaurant_id", "plugin_code", "enabled");



CREATE INDEX "idx_restaurant_plugins_payment_accounts" ON "public"."restaurant_plugins" USING "btree" ("restaurant_id", "enabled") WHERE ("plugin_code" = 'payment-accounts'::"text");



CREATE INDEX "idx_restaurant_plugins_qr_ordering" ON "public"."restaurant_plugins" USING "btree" ("restaurant_id", "enabled") WHERE ("plugin_code" = ANY (ARRAY['qr-ordering-pro'::"text", 'qr-menu'::"text"]));



CREATE INDEX "idx_restaurant_plugins_qr_print_center" ON "public"."restaurant_plugins" USING "btree" ("restaurant_id", "enabled") WHERE ("plugin_code" = 'qr-print-center'::"text");



CREATE INDEX "idx_restaurant_plugins_restaurant_id" ON "public"."restaurant_plugins" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_purchases_restaurant" ON "public"."restaurant_purchases" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_recipes_restaurant" ON "public"."restaurant_recipes" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_staff_shifts_restaurant" ON "public"."restaurant_staff_shifts" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_subscriptions_plan" ON "public"."restaurant_subscriptions" USING "btree" ("plan_id");



CREATE INDEX "idx_restaurant_subscriptions_restaurant" ON "public"."restaurant_subscriptions" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_subscriptions_saas_plan" ON "public"."restaurant_subscriptions" USING "btree" ("saas_plan_id");



CREATE INDEX "idx_restaurant_subscriptions_status" ON "public"."restaurant_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_restaurant_suppliers_restaurant" ON "public"."restaurant_suppliers" USING "btree" ("restaurant_id");



CREATE INDEX "idx_rooms_restaurant_id" ON "public"."rooms" USING "btree" ("restaurant_id");



CREATE INDEX "idx_rooms_restaurant_number" ON "public"."rooms" USING "btree" ("restaurant_id", "room_number");



CREATE INDEX "idx_scan_pay_requests_restaurant" ON "public"."scan_pay_requests" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_service_calls_restaurant" ON "public"."restaurant_service_calls" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_sms_deliveries_restaurant" ON "public"."sms_campaign_deliveries" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE INDEX "idx_staff_events_staff" ON "public"."staff_attendance_events" USING "btree" ("staff_id");



CREATE INDEX "idx_staff_permissions_staff" ON "public"."staff_permissions" USING "btree" ("restaurant_id", "staff_id");



CREATE INDEX "idx_staff_shifts_restaurant" ON "public"."restaurant_staff_shifts" USING "btree" ("restaurant_id", "shift_date" DESC);



CREATE INDEX "idx_stock_usage_restaurant_id" ON "public"."stock_usage" USING "btree" ("restaurant_id");



CREATE INDEX "idx_subscriptions_active_restaurant" ON "public"."restaurant_subscriptions" USING "btree" ("restaurant_id", "status", "updated_at" DESC);



CREATE INDEX "idx_subscriptions_restaurant" ON "public"."restaurant_subscriptions" USING "btree" ("restaurant_id", "status");



CREATE INDEX "idx_subscriptions_saas_plan" ON "public"."restaurant_subscriptions" USING "btree" ("saas_plan_id");



CREATE INDEX "idx_supplier_payments_restaurant" ON "public"."supplier_payments" USING "btree" ("restaurant_id");



CREATE INDEX "idx_table_layout_restaurant" ON "public"."restaurant_table_layouts" USING "btree" ("restaurant_id", "floor_map_id");



CREATE INDEX "idx_table_sessions_restaurant" ON "public"."table_sessions" USING "btree" ("restaurant_id", "opened_at" DESC);



CREATE INDEX "idx_tables_restaurant_id" ON "public"."tables" USING "btree" ("restaurant_id");



CREATE INDEX "idx_tables_restaurant_number" ON "public"."tables" USING "btree" ("restaurant_id", "table_number");



CREATE INDEX "idx_terminals_restaurant" ON "public"."restaurant_terminals" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_tokens_restaurant" ON "public"."order_tokens" USING "btree" ("restaurant_id", "status", "created_at" DESC);



CREATE INDEX "idx_virtual_brands_restaurant" ON "public"."restaurant_virtual_brands" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_waitlist_restaurant" ON "public"."reservation_waitlist" USING "btree" ("restaurant_id", "status", "created_at");



CREATE INDEX "idx_wallet_transactions_customer" ON "public"."customer_wallet_transactions" USING "btree" ("restaurant_id", "customer_id", "created_at" DESC);



CREATE UNIQUE INDEX "uq_customers_restaurant_phone" ON "public"."customers" USING "btree" ("restaurant_id", "phone") WHERE (("phone" IS NOT NULL) AND ("phone" <> ''::"text"));



CREATE UNIQUE INDEX "uq_inventory_tx_order_usage" ON "public"."inventory_transactions" USING "btree" ("inventory_id", "reference_id", "transaction_type") WHERE ("reference_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_loyalty_rewards_restaurant_name" ON "public"."loyalty_rewards" USING "btree" ("restaurant_id", "name");



CREATE UNIQUE INDEX "uq_offers_restaurant_coupon" ON "public"."offers" USING "btree" ("restaurant_id", "lower"("coupon_code")) WHERE (("coupon_code" IS NOT NULL) AND (TRIM(BOTH FROM "coupon_code") <> ''::"text"));



CREATE UNIQUE INDEX "uq_orders_restaurant_invoice" ON "public"."orders" USING "btree" ("restaurant_id", "invoice_no") WHERE ("invoice_no" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_assign_kot_number" BEFORE INSERT ON "public"."kot_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."assign_kot_number"();



CREATE OR REPLACE TRIGGER "trg_award_loyalty_for_order" AFTER INSERT OR UPDATE OF "status", "payment_status", "total_amount", "customer_id" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."award_loyalty_for_order"();



CREATE OR REPLACE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."touch_customer_updated_at"();



CREATE OR REPLACE TRIGGER "trg_delivery_zones_updated_at" BEFORE UPDATE ON "public"."delivery_zones" FOR EACH ROW EXECUTE FUNCTION "public"."touch_delivery_zone_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ensure_kitchen_order_ticket" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_kitchen_order_ticket"();



CREATE OR REPLACE TRIGGER "trg_ensure_legacy_kot_ticket" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_legacy_kot_ticket"();



CREATE OR REPLACE TRIGGER "trg_notify_new_order" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_order"();



CREATE OR REPLACE TRIGGER "trg_order_payments_sync_totals" AFTER INSERT OR DELETE OR UPDATE ON "public"."order_payments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_order_payment_totals"();



CREATE OR REPLACE TRIGGER "trg_order_refunds_sync_totals" AFTER INSERT OR DELETE OR UPDATE ON "public"."order_refunds" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_order_payment_totals"();



CREATE OR REPLACE TRIGGER "trg_order_terminal_automation" AFTER INSERT OR UPDATE OF "status", "order_mode" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_order_terminal_automation"();



CREATE OR REPLACE TRIGGER "trg_set_restaurant_slug" BEFORE INSERT OR UPDATE OF "name", "slug" ON "public"."restaurants" FOR EACH ROW EXECUTE FUNCTION "public"."set_restaurant_slug"();



CREATE OR REPLACE TRIGGER "trg_sync_delivery_from_order" AFTER UPDATE OF "status", "order_mode" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."sync_delivery_from_order"();



CREATE OR REPLACE TRIGGER "trg_sync_kitchen_ticket_status" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."sync_kitchen_ticket_status"();



CREATE OR REPLACE TRIGGER "trg_sync_legacy_kot_ticket_status" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."sync_legacy_kot_ticket_status"();



CREATE OR REPLACE TRIGGER "trg_sync_restaurant_subscription_status" AFTER INSERT OR UPDATE OF "status", "saas_plan_id", "starts_at", "ends_at" ON "public"."restaurant_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_restaurant_status_from_subscription"();



ALTER TABLE ONLY "public"."aggregator_integrations"
    ADD CONSTRAINT "aggregator_integrations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aggregator_orders"
    ADD CONSTRAINT "aggregator_orders_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."aggregator_integrations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aggregator_orders"
    ADD CONSTRAINT "aggregator_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aggregator_orders"
    ADD CONSTRAINT "aggregator_orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aggregator_settlements"
    ADD CONSTRAINT "aggregator_settlements_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aggregator_sync_jobs"
    ADD CONSTRAINT "aggregator_sync_jobs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."branch_inventory_balances"
    ADD CONSTRAINT "branch_inventory_balances_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."restaurant_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."branch_menu_overrides"
    ADD CONSTRAINT "branch_menu_overrides_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."restaurant_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calling_requests"
    ADD CONSTRAINT "calling_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_shifts"
    ADD CONSTRAINT "cash_shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."central_kitchens"
    ADD CONSTRAINT "central_kitchens_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_feedback"
    ADD CONSTRAINT "customer_feedback_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_feedback"
    ADD CONSTRAINT "customer_feedback_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_feedback"
    ADD CONSTRAINT "customer_feedback_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_segment_members"
    ADD CONSTRAINT "customer_segment_members_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_segment_members"
    ADD CONSTRAINT "customer_segment_members_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_segment_members"
    ADD CONSTRAINT "customer_segment_members_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "public"."customer_segments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_segments"
    ADD CONSTRAINT "customer_segments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_assignments"
    ADD CONSTRAINT "delivery_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_assignments"
    ADD CONSTRAINT "delivery_assignments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_assignments"
    ADD CONSTRAINT "delivery_assignments_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."delivery_riders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_otps"
    ADD CONSTRAINT "delivery_otps_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_otps"
    ADD CONSTRAINT "delivery_otps_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dining_tables"
    ADD CONSTRAINT "dining_tables_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."restaurant_areas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dining_tables"
    ADD CONSTRAINT "dining_tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discount_rules"
    ADD CONSTRAINT "discount_rules_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dynamic_report_definitions"
    ADD CONSTRAINT "dynamic_report_definitions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."e_bill_documents"
    ADD CONSTRAINT "e_bill_documents_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_requests"
    ADD CONSTRAINT "feedback_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_requests"
    ADD CONSTRAINT "feedback_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_requests"
    ADD CONSTRAINT "feedback_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_usage"
    ADD CONSTRAINT "fk_inventory" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "fk_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."forecast_snapshots"
    ADD CONSTRAINT "forecast_snapshots_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."kds_events"
    ADD CONSTRAINT "kds_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kds_events"
    ADD CONSTRAINT "kds_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kds_events"
    ADD CONSTRAINT "kds_events_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kitchen_dispatches"
    ADD CONSTRAINT "kitchen_dispatches_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "public"."central_kitchens"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kitchen_dispatches"
    ADD CONSTRAINT "kitchen_dispatches_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kot_routes"
    ADD CONSTRAINT "kot_routes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kot_routes"
    ADD CONSTRAINT "kot_routes_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kot_tickets"
    ADD CONSTRAINT "kot_tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kot_tickets"
    ADD CONSTRAINT "kot_tickets_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_campaigns"
    ADD CONSTRAINT "loyalty_campaigns_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_redemptions"
    ADD CONSTRAINT "loyalty_redemptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_redemptions"
    ADD CONSTRAINT "loyalty_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_redemptions"
    ADD CONSTRAINT "loyalty_redemptions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_redemptions"
    ADD CONSTRAINT "loyalty_redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."loyalty_referrals"
    ADD CONSTRAINT "loyalty_referrals_referred_customer_id_fkey" FOREIGN KEY ("referred_customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_referrals"
    ADD CONSTRAINT "loyalty_referrals_referrer_customer_id_fkey" FOREIGN KEY ("referrer_customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_referrals"
    ADD CONSTRAINT "loyalty_referrals_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_settings"
    ADD CONSTRAINT "loyalty_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_item_modifier_groups"
    ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_item_modifier_groups"
    ADD CONSTRAINT "menu_item_modifier_groups_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_item_modifier_groups"
    ADD CONSTRAINT "menu_item_modifier_groups_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_variants"
    ADD CONSTRAINT "menu_variants_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_variants"
    ADD CONSTRAINT "menu_variants_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_queue"
    ADD CONSTRAINT "message_queue_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_queue"
    ADD CONSTRAINT "message_queue_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."modifier_groups"
    ADD CONSTRAINT "modifier_groups_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."modifiers"
    ADD CONSTRAINT "modifiers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."modifiers"
    ADD CONSTRAINT "modifiers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offer_products"
    ADD CONSTRAINT "offer_products_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offer_products"
    ADD CONSTRAINT "offer_products_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_get_product_id_fkey" FOREIGN KEY ("get_product_id") REFERENCES "public"."menu_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."offline_pos_events"
    ADD CONSTRAINT "offline_pos_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_discount_applications"
    ADD CONSTRAINT "order_discount_applications_discount_rule_id_fkey" FOREIGN KEY ("discount_rule_id") REFERENCES "public"."discount_rules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_discount_applications"
    ADD CONSTRAINT "order_discount_applications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_discount_applications"
    ADD CONSTRAINT "order_discount_applications_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_item_modifiers"
    ADD CONSTRAINT "order_item_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifiers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_item_modifiers"
    ADD CONSTRAINT "order_item_modifiers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_item_id_fkey1" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_split_items"
    ADD CONSTRAINT "order_split_items_split_id_fkey" FOREIGN KEY ("split_id") REFERENCES "public"."order_splits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_gateway_configs"
    ADD CONSTRAINT "payment_gateway_configs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_audit_events"
    ADD CONSTRAINT "pos_audit_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."print_jobs"
    ADD CONSTRAINT "print_jobs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."printer_devices"
    ADD CONSTRAINT "printer_devices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_referred_customer_id_fkey" FOREIGN KEY ("referred_customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_schedules"
    ADD CONSTRAINT "report_schedules_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservation_deposits"
    ADD CONSTRAINT "reservation_deposits_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservation_deposits"
    ADD CONSTRAINT "reservation_deposits_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservation_waitlist"
    ADD CONSTRAINT "reservation_waitlist_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_approval_requests"
    ADD CONSTRAINT "restaurant_approval_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."restaurant_approval_requests"
    ADD CONSTRAINT "restaurant_approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."restaurant_approval_requests"
    ADD CONSTRAINT "restaurant_approval_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_areas"
    ADD CONSTRAINT "restaurant_areas_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_banners"
    ADD CONSTRAINT "restaurant_banners_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_channels"
    ADD CONSTRAINT "restaurant_channels_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_integrations"
    ADD CONSTRAINT "restaurant_integrations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_loyalty_transactions"
    ADD CONSTRAINT "restaurant_loyalty_transactions_loyalty_account_id_fkey" FOREIGN KEY ("loyalty_account_id") REFERENCES "public"."restaurant_loyalty_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_menu_publications"
    ADD CONSTRAINT "restaurant_menu_publications_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_offline_queue"
    ADD CONSTRAINT "restaurant_offline_queue_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_offline_queue"
    ADD CONSTRAINT "restaurant_offline_queue_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "public"."restaurant_terminals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."restaurant_payment_accounts"
    ADD CONSTRAINT "restaurant_payment_accounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_payment_settings"
    ADD CONSTRAINT "restaurant_payment_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_plugins"
    ADD CONSTRAINT "restaurant_plugins_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_purchase_items"
    ADD CONSTRAINT "restaurant_purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."restaurant_purchases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_recipe_items"
    ADD CONSTRAINT "restaurant_recipe_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."restaurant_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_subscriptions"
    ADD CONSTRAINT "restaurant_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."restaurant_subscriptions"
    ADD CONSTRAINT "restaurant_subscriptions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_subscriptions"
    ADD CONSTRAINT "restaurant_subscriptions_saas_plan_id_fkey" FOREIGN KEY ("saas_plan_id") REFERENCES "public"."saas_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."restaurant_terminals"
    ADD CONSTRAINT "restaurant_terminals_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_virtual_brands"
    ADD CONSTRAINT "restaurant_virtual_brands_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_website_settings"
    ADD CONSTRAINT "restaurant_website_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scan_pay_requests"
    ADD CONSTRAINT "scan_pay_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sms_campaign_deliveries"
    ADD CONSTRAINT "sms_campaign_deliveries_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_attendance"
    ADD CONSTRAINT "staff_attendance_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_attendance"
    ADD CONSTRAINT "staff_attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_permissions"
    ADD CONSTRAINT "staff_permissions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_permissions"
    ADD CONSTRAINT "staff_permissions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."website_order_settings"
    ADD CONSTRAINT "website_order_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE "public"."aggregator_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aggregator_menu_controls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aggregator_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aggregator_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aggregator_settlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aggregator_sync_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "approvals_scoped_v1" ON "public"."restaurant_approval_requests" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "attendance_scoped" ON "public"."staff_attendance" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_read_restaurant" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'super_admin'::"text") OR (("p"."restaurant_id" = "audit_logs"."restaurant_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))))));



CREATE POLICY "audit_scoped" ON "public"."audit_logs" USING ((("restaurant_id" IS NULL) OR "public"."is_restaurant_member"("restaurant_id"))) WITH CHECK ((("restaurant_id" IS NULL) OR "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "banners_delete_admin" ON "public"."restaurant_banners" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "banners_insert_admin" ON "public"."restaurant_banners" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "banners_select_authenticated_own" ON "public"."restaurant_banners" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "banners_update_admin" ON "public"."restaurant_banners" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "branch inventory access" ON "public"."branch_inventory_balances" USING (("branch_id" IN ( SELECT "restaurant_branches"."id"
   FROM "public"."restaurant_branches"
  WHERE ("restaurant_branches"."parent_restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) WITH CHECK (("branch_id" IN ( SELECT "restaurant_branches"."id"
   FROM "public"."restaurant_branches"
  WHERE ("restaurant_branches"."parent_restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "branch menu access" ON "public"."branch_menu_overrides" USING (("branch_id" IN ( SELECT "restaurant_branches"."id"
   FROM "public"."restaurant_branches"
  WHERE ("restaurant_branches"."parent_restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) WITH CHECK (("branch_id" IN ( SELECT "restaurant_branches"."id"
   FROM "public"."restaurant_branches"
  WHERE ("restaurant_branches"."parent_restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."branch_inventory_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."branch_menu_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calling_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calling_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."captain_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_closings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_scoped" ON "public"."cash_closings" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."cash_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."central_kitchens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channels_scoped_v1" ON "public"."restaurant_channels" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."customer_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_segment_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_wallet_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_wallets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_scoped" ON "public"."customers" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."delivery_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_otps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_riders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_settlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_zones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digital_display_calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digital_display_playlists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dining_tables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discount_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dynamic_report_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."e_bill_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_scoped" ON "public"."expenses" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."feedback_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_scoped" ON "public"."customer_feedback" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."food_cost_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forecast_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goods_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integrations_scoped_v1" ON "public"."restaurant_integrations" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_delete_admin" ON "public"."inventory" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "inventory_insert_admin" ON "public"."inventory" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_select_own" ON "public"."inventory" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_transactions_read_restaurant" ON "public"."inventory_transactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'super_admin'::"text") OR (("p"."restaurant_id" = "inventory_transactions"."restaurant_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))))));



ALTER TABLE "public"."inventory_transfers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_update_admin" ON "public"."inventory" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."inventory_wastage" ENABLE ROW LEVEL SECURITY;


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



ALTER TABLE "public"."kds_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kitchen_dispatches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kitchen_order_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kitchen_stations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kot_routes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kot_scoped" ON "public"."kot_tickets" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."kot_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_campaigns_scoped" ON "public"."loyalty_campaigns" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."loyalty_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_redemptions_scoped" ON "public"."loyalty_redemptions" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."loyalty_referrals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_referrals_scoped" ON "public"."loyalty_referrals" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."loyalty_rewards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_rewards_scoped" ON "public"."loyalty_rewards" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "loyalty_scoped" ON "public"."loyalty_transactions" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."loyalty_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_settings_scoped" ON "public"."loyalty_settings" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."loyalty_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_tiers_scoped" ON "public"."loyalty_tiers" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."loyalty_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_item_modifier_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_item_modifier_groups_scoped" ON "public"."menu_item_modifier_groups" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items_delete_admin" ON "public"."menu_items" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "menu_items_insert_admin" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "menu_items_select_authenticated_own" ON "public"."menu_items" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "menu_items_update_admin" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "menu_publications_scoped_v1" ON "public"."restaurant_menu_publications" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."menu_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modifier_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "modifier_groups_scoped" ON "public"."modifier_groups" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."modifiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "modifiers_scoped" ON "public"."modifiers" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_scoped" ON "public"."notifications" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."offer_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offer_products_delete_admin" ON "public"."offer_products" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."offers" "o"
  WHERE (("o"."id" = "offer_products"."offer_id") AND "public"."can_manage_restaurant"("o"."restaurant_id")))));



CREATE POLICY "offer_products_insert_admin" ON "public"."offer_products" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."offers" "o"
  WHERE (("o"."id" = "offer_products"."offer_id") AND "public"."can_manage_restaurant"("o"."restaurant_id")))) AND (EXISTS ( SELECT 1
   FROM ("public"."menu_items" "mi"
     JOIN "public"."offers" "o" ON (("o"."restaurant_id" = "mi"."restaurant_id")))
  WHERE (("mi"."id" = "offer_products"."menu_item_id") AND ("o"."id" = "offer_products"."offer_id"))))));



CREATE POLICY "offer_products_public_read" ON "public"."offer_products" FOR SELECT TO "anon" USING (true);



CREATE POLICY "offer_products_select_authenticated_own" ON "public"."offer_products" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."offers" "o"
  WHERE (("o"."id" = "offer_products"."offer_id") AND ("o"."restaurant_id" = "public"."current_restaurant_id"()))))));



ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offers_delete_admin" ON "public"."offers" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "offers_insert_admin" ON "public"."offers" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "offers_select_authenticated_own" ON "public"."offers" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "offers_update_admin" ON "public"."offers" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."offline_pos_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offline_queue_scoped_v1" ON "public"."restaurant_offline_queue" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."online_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."online_order_reconciliations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_discount_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_holds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_item_modifiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_item_modifiers_scoped" ON "public"."order_item_modifiers" USING ((EXISTS ( SELECT 1
   FROM ("public"."order_items" "oi"
     JOIN "public"."orders" "o" ON (("o"."id" = "oi"."order_id")))
  WHERE (("oi"."id" = "order_item_modifiers"."order_item_id") AND "public"."is_restaurant_member"("o"."restaurant_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."order_items" "oi"
     JOIN "public"."orders" "o" ON (("o"."id" = "oi"."order_id")))
  WHERE (("oi"."id" = "order_item_modifiers"."order_item_id") AND "public"."is_restaurant_member"("o"."restaurant_id")))));



ALTER TABLE "public"."order_item_moves" ENABLE ROW LEVEL SECURITY;


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



ALTER TABLE "public"."order_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_payments_delete_admin" ON "public"."order_payments" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "order_payments_insert_staff_admin" ON "public"."order_payments" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "order_payments_select_staff_admin" ON "public"."order_payments" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id"))));



CREATE POLICY "order_payments_update_staff_admin" ON "public"."order_payments" FOR UPDATE TO "authenticated" USING (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id"))) WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



ALTER TABLE "public"."order_refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_refunds_insert_staff_admin" ON "public"."order_refunds" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "order_refunds_select_staff_admin" ON "public"."order_refunds" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id"))));



ALTER TABLE "public"."order_split_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_splits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_delete_admin" ON "public"."orders" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "orders_insert_staff_admin" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "orders_select_staff_admin" ON "public"."orders" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR (("public"."current_user_role"() = ANY (ARRAY['staff'::"text", 'admin'::"text"])) AND ("restaurant_id" = "public"."current_restaurant_id"()))));



CREATE POLICY "orders_update_staff_admin" ON "public"."orders" FOR UPDATE TO "authenticated" USING (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id"))) WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "payment_accounts_scoped_v1" ON "public"."restaurant_payment_accounts" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."payment_gateway_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_webhook_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_scoped" ON "public"."staff_permissions" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."plan_features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_features_delete_superadmin" ON "public"."plan_features" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "plan_features_insert_superadmin" ON "public"."plan_features" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "plan_features_select_access" ON "public"."plan_features" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."restaurant_subscriptions" "rs"
  WHERE (("rs"."plan_id" = "plan_features"."plan_id") AND ("rs"."restaurant_id" = "public"."current_restaurant_id"()) AND ("rs"."status" = ANY (ARRAY['trial'::"text", 'active'::"text"])))))));



CREATE POLICY "plan_features_update_superadmin" ON "public"."plan_features" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans_delete_superadmin" ON "public"."plans" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "plans_insert_superadmin" ON "public"."plans" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "plans_read" ON "public"."saas_plans" FOR SELECT USING (true);



CREATE POLICY "plans_select_superadmin" ON "public"."plans" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "plans_update_superadmin" ON "public"."plans" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



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



ALTER TABLE "public"."pos_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_terminals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."print_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."printer_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_superadmin" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "profiles_insert_superadmin" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "profiles_select_self_or_superadmin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "profiles_update_superadmin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_codes_scoped" ON "public"."referral_codes" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."referral_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_events_scoped" ON "public"."referral_events" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."report_exports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservation_deposits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservation_reminders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservation_waitlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reservations_delete_admin" ON "public"."reservations" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "reservations_insert_staff_admin" ON "public"."reservations" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "reservations_select_own" ON "public"."reservations" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "reservations_update_staff_admin" ON "public"."reservations" FOR UPDATE TO "authenticated" USING (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id"))) WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "restaurant members branches" ON "public"."restaurant_branches" USING (("parent_restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("parent_restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members calling_devices" ON "public"."calling_devices" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members captain_sessions" ON "public"."captain_sessions" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members cash" ON "public"."restaurant_cash_sessions" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members cash_movements" ON "public"."cash_movements" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members customer_memberships" ON "public"."customer_memberships" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members customer_preferences" ON "public"."customer_preferences" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members deliveries" ON "public"."restaurant_deliveries" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members deliveries v2" ON "public"."restaurant_deliveries" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members delivery_events" ON "public"."delivery_events" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members delivery_riders" ON "public"."delivery_riders" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members delivery_zones" ON "public"."delivery_zones" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members digital_display_playlists" ON "public"."digital_display_playlists" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members food_cost_snapshots" ON "public"."food_cost_snapshots" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members goods_receipts" ON "public"."goods_receipts" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members inventory_batches" ON "public"."inventory_batches" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members inventory_movements" ON "public"."inventory_movements" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members inventory_transfers" ON "public"."inventory_transfers" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members inventory_wastage" ON "public"."inventory_wastage" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members kitchen_order_tickets" ON "public"."kitchen_order_tickets" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members kitchen_stations" ON "public"."kitchen_stations" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members loyalty" ON "public"."restaurant_loyalty_accounts" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members loyalty tx" ON "public"."restaurant_loyalty_transactions" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members marketing_campaigns" ON "public"."marketing_campaigns" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members online_channels" ON "public"."online_channels" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members online_order_reconciliations" ON "public"."online_order_reconciliations" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members order split items" ON "public"."order_split_items" USING (("split_id" IN ( SELECT "order_splits"."id"
   FROM "public"."order_splits"
  WHERE ("order_splits"."restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) WITH CHECK (("split_id" IN ( SELECT "order_splits"."id"
   FROM "public"."order_splits"
  WHERE ("order_splits"."restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "restaurant members order_holds" ON "public"."order_holds" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members order_item_moves" ON "public"."order_item_moves" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members order_payments" ON "public"."order_payments" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members order_refunds" ON "public"."order_refunds" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members order_splits" ON "public"."order_splits" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members order_tokens" ON "public"."order_tokens" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members order_transfers" ON "public"."order_transfers" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members purchase items" ON "public"."restaurant_purchase_items" USING (("purchase_id" IN ( SELECT "restaurant_purchases"."id"
   FROM "public"."restaurant_purchases"
  WHERE ("restaurant_purchases"."restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) WITH CHECK (("purchase_id" IN ( SELECT "restaurant_purchases"."id"
   FROM "public"."restaurant_purchases"
  WHERE ("restaurant_purchases"."restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "restaurant members purchase_orders" ON "public"."purchase_orders" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members purchases" ON "public"."restaurant_purchases" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members recipe items" ON "public"."restaurant_recipe_items" USING (("recipe_id" IN ( SELECT "restaurant_recipes"."id"
   FROM "public"."restaurant_recipes"
  WHERE ("restaurant_recipes"."restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) WITH CHECK (("recipe_id" IN ( SELECT "restaurant_recipes"."id"
   FROM "public"."restaurant_recipes"
  WHERE ("restaurant_recipes"."restaurant_id" = ( SELECT "profiles"."restaurant_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "restaurant members recipes" ON "public"."restaurant_recipes" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members review_replies" ON "public"."review_replies" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members role_permissions" ON "public"."role_permissions" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members self_service_kiosks" ON "public"."self_service_kiosks" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members shifts" ON "public"."restaurant_staff_shifts" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members staff_attendance_events" ON "public"."staff_attendance_events" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members staff_breaks" ON "public"."staff_breaks" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members staff_pay_rules" ON "public"."staff_pay_rules" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members supplier_payments" ON "public"."supplier_payments" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant members suppliers" ON "public"."restaurant_suppliers" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant parity scoped aggregator_integrations" ON "public"."aggregator_integrations" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped aggregator_orders" ON "public"."aggregator_orders" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped aggregator_settlements" ON "public"."aggregator_settlements" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped aggregator_sync_jobs" ON "public"."aggregator_sync_jobs" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped calling_requests" ON "public"."calling_requests" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped cash_movements" ON "public"."cash_movements" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped cash_shifts" ON "public"."cash_shifts" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped customer_segment_members" ON "public"."customer_segment_members" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped customer_segments" ON "public"."customer_segments" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped kds_events" ON "public"."kds_events" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped message_queue" ON "public"."message_queue" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped order_status_history" ON "public"."order_status_history" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped order_tokens" ON "public"."order_tokens" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped payment_webhook_events" ON "public"."payment_webhook_events" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped print_jobs" ON "public"."print_jobs" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped report_schedules" ON "public"."report_schedules" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped reservation_deposits" ON "public"."reservation_deposits" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped reservation_reminders" ON "public"."reservation_reminders" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant parity scoped reservation_waitlist" ON "public"."reservation_waitlist" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped aggregator_menu_controls" ON "public"."aggregator_menu_controls" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped aggregator_payouts" ON "public"."aggregator_payouts" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped central_kitchens" ON "public"."central_kitchens" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped customer_wallet_transactions" ON "public"."customer_wallet_transactions" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped customer_wallets" ON "public"."customer_wallets" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped delivery_settlements" ON "public"."delivery_settlements" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped digital_display_calls" ON "public"."digital_display_calls" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped dynamic_report_definitions" ON "public"."dynamic_report_definitions" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped e_bill_documents" ON "public"."e_bill_documents" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped forecast_snapshots" ON "public"."forecast_snapshots" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped kitchen_dispatches" ON "public"."kitchen_dispatches" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped order_holds" ON "public"."order_holds" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped payment_gateway_configs" ON "public"."payment_gateway_configs" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped pos_terminals" ON "public"."pos_terminals" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped printer_devices" ON "public"."printer_devices" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped report_exports" ON "public"."report_exports" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped reservation_reminders" ON "public"."reservation_reminders" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped scan_pay_requests" ON "public"."scan_pay_requests" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped sms_campaign_deliveries" ON "public"."sms_campaign_deliveries" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_aggregator_accounts" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_approval_decisions" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_campaign_runs" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_captain_sessions" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_cash_movements" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_customer_segments" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_display_events" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_floor_maps" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_hardware_devices" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_integration_jobs" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_kiosk_sessions" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_menu_versions" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_report_runs" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_reservation_events" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_service_calls" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v13" ON "public"."restaurant_table_layouts" USING (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("restaurant_id" = ( SELECT "profiles"."restaurant_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "restaurant scoped v6 delivery_assignments" ON "public"."delivery_assignments" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 delivery_otps" ON "public"."delivery_otps" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 dining_tables" ON "public"."dining_tables" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 discount_rules" ON "public"."discount_rules" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 feedback_requests" ON "public"."feedback_requests" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 kot_routes" ON "public"."kot_routes" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 menu_variants" ON "public"."menu_variants" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 offline_pos_events" ON "public"."offline_pos_events" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 order_discount_applications" ON "public"."order_discount_applications" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 pos_audit_events" ON "public"."pos_audit_events" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 restaurant_areas" ON "public"."restaurant_areas" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 restaurant_payment_settings" ON "public"."restaurant_payment_settings" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped v6 table_sessions" ON "public"."table_sessions" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "restaurant scoped website_order_settings" ON "public"."website_order_settings" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."restaurant_aggregator_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_approval_decisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_approval_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_areas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_banners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_campaign_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_captain_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_cash_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_cash_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_customer_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_display_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_floor_maps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_hardware_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_integration_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_kiosk_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_loyalty_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_loyalty_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_menu_publications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_menu_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_offline_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_payment_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_payment_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_plugins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restaurant_plugins_manage_admin" ON "public"."restaurant_plugins" TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "restaurant_plugins_select_own" ON "public"."restaurant_plugins" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



ALTER TABLE "public"."restaurant_purchase_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_recipe_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_report_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_reservation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_service_calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_staff_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_table_layouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_terminals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_virtual_brands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_website_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restaurants_delete_superadmin" ON "public"."restaurants" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "restaurants_insert_superadmin" ON "public"."restaurants" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "restaurants_select_authenticated_own" ON "public"."restaurants" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("id" = "public"."current_restaurant_id"())));



CREATE POLICY "restaurants_update_owner_or_superadmin" ON "public"."restaurants" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR (("public"."current_user_role"() = 'admin'::"text") AND ("owner_id" = "auth"."uid"()) AND ("id" = "public"."current_restaurant_id"())))) WITH CHECK (("public"."is_super_admin"() OR (("public"."current_user_role"() = 'admin'::"text") AND ("owner_id" = "auth"."uid"()) AND ("id" = "public"."current_restaurant_id"()))));



ALTER TABLE "public"."review_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rooms_delete_admin" ON "public"."rooms" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "rooms_insert_admin" ON "public"."rooms" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "rooms_select_authenticated_own" ON "public"."rooms" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "rooms_update_admin" ON "public"."rooms" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



ALTER TABLE "public"."saas_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scan_pay_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."self_service_kiosks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settings_delete_self" ON "public"."settings" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "settings_insert_self" ON "public"."settings" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "settings_select_self" ON "public"."settings" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "settings_update_self" ON "public"."settings" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "shifts_scoped_v1" ON "public"."restaurant_staff_shifts" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."sms_campaign_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_attendance_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_breaks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_pay_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_usage_delete_admin" ON "public"."stock_usage" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "stock_usage_insert_staff_admin" ON "public"."stock_usage" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff_or_admin"() AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "stock_usage_select_own" ON "public"."stock_usage" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "stock_usage_update_admin" ON "public"."stock_usage" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "subscriptions_delete_superadmin" ON "public"."restaurant_subscriptions" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "subscriptions_insert_superadmin" ON "public"."restaurant_subscriptions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "subscriptions_scoped" ON "public"."restaurant_subscriptions" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "subscriptions_select_access" ON "public"."restaurant_subscriptions" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."current_restaurant_id"() = "restaurant_id")));



CREATE POLICY "subscriptions_update_superadmin" ON "public"."restaurant_subscriptions" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."supplier_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."table_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tables_delete_admin" ON "public"."tables" FOR DELETE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "tables_insert_admin" ON "public"."tables" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "tables_select_authenticated_own" ON "public"."tables" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("restaurant_id" = "public"."current_restaurant_id"())));



CREATE POLICY "tables_update_admin" ON "public"."tables" FOR UPDATE TO "authenticated" USING ("public"."can_manage_restaurant"("restaurant_id")) WITH CHECK ("public"."can_manage_restaurant"("restaurant_id"));



CREATE POLICY "terminals_scoped_v1" ON "public"."restaurant_terminals" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_manage_superadmin" ON "public"."users" TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "users_select_self_or_superadmin" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "virtual_brands_scoped_v1" ON "public"."restaurant_virtual_brands" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."website_order_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "website_scoped_v1" ON "public"."restaurant_website_settings" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_discount_rule"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_rule_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_discount_rule"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_rule_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_discount_rule"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_rule_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_recipe_stock_deduction"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_recipe_stock_deduction"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_recipe_stock_deduction"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_kot_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_kot_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_kot_number"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_loyalty_for_order"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_loyalty_for_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_loyalty_for_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_delivery_settlement_difference"("p_expected_cash" numeric, "p_expected_upi" numeric, "p_expected_card" numeric, "p_submitted_cash" numeric, "p_submitted_upi" numeric, "p_submitted_card" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_delivery_settlement_difference"("p_expected_cash" numeric, "p_expected_upi" numeric, "p_expected_card" numeric, "p_submitted_cash" numeric, "p_submitted_upi" numeric, "p_submitted_card" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_delivery_settlement_difference"("p_expected_cash" numeric, "p_expected_upi" numeric, "p_expected_card" numeric, "p_submitted_cash" numeric, "p_submitted_upi" numeric, "p_submitted_card" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_food_cost"("p_restaurant_id" "uuid", "p_menu_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_food_cost"("p_restaurant_id" "uuid", "p_menu_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_food_cost"("p_restaurant_id" "uuid", "p_menu_item_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_offer_discount"("p_offer_id" "uuid", "p_order_id" "uuid", "p_subtotal" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_offer_discount"("p_offer_id" "uuid", "p_order_id" "uuid", "p_subtotal" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_offer_discount"("p_offer_id" "uuid", "p_order_id" "uuid", "p_subtotal" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_restaurant"("p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_notification"() TO "service_role";



GRANT ALL ON TABLE "public"."order_tokens" TO "anon";
GRANT ALL ON TABLE "public"."order_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."order_tokens" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text", "p_pickup_name" "text", "p_pickup_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text", "p_pickup_name" "text", "p_pickup_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text", "p_pickup_name" "text", "p_pickup_phone" "text") TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."delete_restaurant_cascade"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_restaurant_cascade"("p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_restaurant_cascade"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_restaurant_cascade"("p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."customer_wallets" TO "anon";
GRANT ALL ON TABLE "public"."customer_wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_wallets" TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_customer_wallet"("p_restaurant_id" "uuid", "p_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_customer_wallet"("p_restaurant_id" "uuid", "p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_customer_wallet"("p_restaurant_id" "uuid", "p_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_kitchen_order_ticket"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_kitchen_order_ticket"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_kitchen_order_ticket"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_legacy_kot_ticket"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_legacy_kot_ticket"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_legacy_kot_ticket"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_qr_context"("p_slug" "text", "p_type" "text", "p_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_rating_summary"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_rating_summary"("p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_rating_summary"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_rating_summary"("p_restaurant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_restaurant_plan"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_restaurant_plan"("p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_restaurant_plan"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_restaurant_plan"("p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_plan_feature"("p_plugin_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_plan_feature"("p_plugin_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_plan_feature"("p_plugin_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_restaurant_plan_feature"("p_restaurant_id" "uuid", "p_plugin_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_restaurant_plan_feature"("p_restaurant_id" "uuid", "p_plugin_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_restaurant_plan_feature"("p_restaurant_id" "uuid", "p_plugin_code" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."has_staff_permission"("p_staff_id" "uuid", "p_permission_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_staff_permission"("p_staff_id" "uuid", "p_permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_staff_permission"("p_staff_id" "uuid", "p_permission_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_restaurant_feature_enabled"("p_restaurant_id" "uuid", "p_plugin_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_restaurant_feature_enabled"("p_restaurant_id" "uuid", "p_plugin_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_restaurant_feature_enabled"("p_restaurant_id" "uuid", "p_plugin_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_staff_or_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_staff_or_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff_or_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."issue_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text", "p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_order_token"("p_restaurant_id" "uuid", "p_order_id" "uuid", "p_token_type" "text", "p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."make_restaurant_slug"("p_name" "text", "p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."make_restaurant_slug"("p_name" "text", "p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."make_restaurant_slug"("p_name" "text", "p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."next_delivery_slip_no"("p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."next_delivery_slip_no"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_delivery_slip_no"("p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_order"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."preview_order_offers"("p_order_id" "uuid", "p_subtotal" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preview_order_offers"("p_order_id" "uuid", "p_subtotal" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."preview_order_offers"("p_order_id" "uuid", "p_subtotal" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_loyalty_config"("p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_loyalty_config"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_loyalty_config"("p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."dining_tables" TO "anon";
GRANT ALL ON TABLE "public"."dining_tables" TO "authenticated";
GRANT ALL ON TABLE "public"."dining_tables" TO "service_role";



GRANT ALL ON FUNCTION "public"."set_dining_table_status"("p_restaurant_id" "uuid", "p_table_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_dining_table_status"("p_restaurant_id" "uuid", "p_table_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_dining_table_status"("p_restaurant_id" "uuid", "p_table_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_restaurant_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_restaurant_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_restaurant_slug"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."sync_delivery_from_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_delivery_from_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_delivery_from_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_kitchen_ticket_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_kitchen_ticket_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_kitchen_ticket_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_legacy_kot_ticket_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_legacy_kot_ticket_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_legacy_kot_ticket_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_order_payment_totals"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_order_payment_totals"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_order_payment_totals"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_restaurant_status_from_subscription"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_restaurant_status_from_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_restaurant_status_from_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_customer_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_customer_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_customer_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_delivery_zone_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_delivery_zone_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_delivery_zone_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_order_terminal_automation"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_order_terminal_automation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_order_terminal_automation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_sync_order_payment_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_sync_order_payment_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_sync_order_payment_totals"() TO "service_role";



GRANT ALL ON TABLE "public"."aggregator_integrations" TO "anon";
GRANT ALL ON TABLE "public"."aggregator_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."aggregator_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."aggregator_menu_controls" TO "anon";
GRANT ALL ON TABLE "public"."aggregator_menu_controls" TO "authenticated";
GRANT ALL ON TABLE "public"."aggregator_menu_controls" TO "service_role";



GRANT ALL ON TABLE "public"."aggregator_orders" TO "anon";
GRANT ALL ON TABLE "public"."aggregator_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."aggregator_orders" TO "service_role";



GRANT ALL ON TABLE "public"."aggregator_payouts" TO "anon";
GRANT ALL ON TABLE "public"."aggregator_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."aggregator_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."aggregator_settlements" TO "anon";
GRANT ALL ON TABLE "public"."aggregator_settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."aggregator_settlements" TO "service_role";



GRANT ALL ON TABLE "public"."aggregator_sync_jobs" TO "anon";
GRANT ALL ON TABLE "public"."aggregator_sync_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."aggregator_sync_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."audit_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."branch_inventory_balances" TO "anon";
GRANT ALL ON TABLE "public"."branch_inventory_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."branch_inventory_balances" TO "service_role";



GRANT ALL ON TABLE "public"."branch_menu_overrides" TO "anon";
GRANT ALL ON TABLE "public"."branch_menu_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."branch_menu_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."calling_devices" TO "anon";
GRANT ALL ON TABLE "public"."calling_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."calling_devices" TO "service_role";



GRANT ALL ON TABLE "public"."calling_requests" TO "anon";
GRANT ALL ON TABLE "public"."calling_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."calling_requests" TO "service_role";



GRANT ALL ON TABLE "public"."captain_sessions" TO "anon";
GRANT ALL ON TABLE "public"."captain_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."captain_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."cash_closings" TO "anon";
GRANT ALL ON TABLE "public"."cash_closings" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_closings" TO "service_role";



GRANT ALL ON TABLE "public"."cash_movements" TO "anon";
GRANT ALL ON TABLE "public"."cash_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_movements" TO "service_role";



GRANT ALL ON TABLE "public"."cash_shifts" TO "anon";
GRANT ALL ON TABLE "public"."cash_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."central_kitchens" TO "anon";
GRANT ALL ON TABLE "public"."central_kitchens" TO "authenticated";
GRANT ALL ON TABLE "public"."central_kitchens" TO "service_role";



GRANT ALL ON TABLE "public"."customer_feedback" TO "anon";
GRANT ALL ON TABLE "public"."customer_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."customer_memberships" TO "anon";
GRANT ALL ON TABLE "public"."customer_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."customer_preferences" TO "anon";
GRANT ALL ON TABLE "public"."customer_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."customer_segment_members" TO "anon";
GRANT ALL ON TABLE "public"."customer_segment_members" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_segment_members" TO "service_role";



GRANT ALL ON TABLE "public"."customer_segments" TO "anon";
GRANT ALL ON TABLE "public"."customer_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_segments" TO "service_role";



GRANT ALL ON TABLE "public"."customer_wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."customer_wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_assignments" TO "anon";
GRANT ALL ON TABLE "public"."delivery_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_events" TO "anon";
GRANT ALL ON TABLE "public"."delivery_events" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_events" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_otps" TO "anon";
GRANT ALL ON TABLE "public"."delivery_otps" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_otps" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_riders" TO "anon";
GRANT ALL ON TABLE "public"."delivery_riders" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_riders" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_settlements" TO "anon";
GRANT ALL ON TABLE "public"."delivery_settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_settlements" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_zones" TO "anon";
GRANT ALL ON TABLE "public"."delivery_zones" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_zones" TO "service_role";



GRANT ALL ON TABLE "public"."digital_display_calls" TO "anon";
GRANT ALL ON TABLE "public"."digital_display_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."digital_display_calls" TO "service_role";



GRANT ALL ON TABLE "public"."digital_display_playlists" TO "anon";
GRANT ALL ON TABLE "public"."digital_display_playlists" TO "authenticated";
GRANT ALL ON TABLE "public"."digital_display_playlists" TO "service_role";



GRANT ALL ON TABLE "public"."discount_rules" TO "anon";
GRANT ALL ON TABLE "public"."discount_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_rules" TO "service_role";



GRANT ALL ON TABLE "public"."dynamic_report_definitions" TO "anon";
GRANT ALL ON TABLE "public"."dynamic_report_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."dynamic_report_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."e_bill_documents" TO "anon";
GRANT ALL ON TABLE "public"."e_bill_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."e_bill_documents" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_requests" TO "anon";
GRANT ALL ON TABLE "public"."feedback_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_requests" TO "service_role";



GRANT ALL ON TABLE "public"."food_cost_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."food_cost_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."food_cost_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."forecast_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."forecast_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."goods_receipts" TO "anon";
GRANT ALL ON TABLE "public"."goods_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."goods_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_batches" TO "anon";
GRANT ALL ON TABLE "public"."inventory_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_batches" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_transactions" TO "service_role";
GRANT SELECT ON TABLE "public"."inventory_transactions" TO "authenticated";



GRANT ALL ON TABLE "public"."inventory_transfers" TO "anon";
GRANT ALL ON TABLE "public"."inventory_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_wastage" TO "anon";
GRANT ALL ON TABLE "public"."inventory_wastage" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_wastage" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."item_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."item_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."kds_events" TO "anon";
GRANT ALL ON TABLE "public"."kds_events" TO "authenticated";
GRANT ALL ON TABLE "public"."kds_events" TO "service_role";



GRANT ALL ON TABLE "public"."kitchen_dispatches" TO "anon";
GRANT ALL ON TABLE "public"."kitchen_dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."kitchen_dispatches" TO "service_role";



GRANT ALL ON TABLE "public"."kitchen_order_tickets" TO "anon";
GRANT ALL ON TABLE "public"."kitchen_order_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."kitchen_order_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."kitchen_stations" TO "anon";
GRANT ALL ON TABLE "public"."kitchen_stations" TO "authenticated";
GRANT ALL ON TABLE "public"."kitchen_stations" TO "service_role";



GRANT ALL ON TABLE "public"."kot_routes" TO "anon";
GRANT ALL ON TABLE "public"."kot_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."kot_routes" TO "service_role";



GRANT ALL ON TABLE "public"."kot_tickets" TO "anon";
GRANT ALL ON TABLE "public"."kot_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."kot_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_referrals" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_referrals" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_rewards" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_settings" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_settings" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_tiers" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_transactions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."menu_item_modifier_groups" TO "anon";
GRANT ALL ON TABLE "public"."menu_item_modifier_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_item_modifier_groups" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."menu_variants" TO "anon";
GRANT ALL ON TABLE "public"."menu_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_variants" TO "service_role";



GRANT ALL ON TABLE "public"."message_queue" TO "anon";
GRANT ALL ON TABLE "public"."message_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."message_queue" TO "service_role";



GRANT ALL ON TABLE "public"."modifier_groups" TO "anon";
GRANT ALL ON TABLE "public"."modifier_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."modifier_groups" TO "service_role";



GRANT ALL ON TABLE "public"."modifiers" TO "anon";
GRANT ALL ON TABLE "public"."modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."offer_products" TO "anon";
GRANT ALL ON TABLE "public"."offer_products" TO "authenticated";
GRANT ALL ON TABLE "public"."offer_products" TO "service_role";



GRANT ALL ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT ALL ON TABLE "public"."offline_pos_events" TO "anon";
GRANT ALL ON TABLE "public"."offline_pos_events" TO "authenticated";
GRANT ALL ON TABLE "public"."offline_pos_events" TO "service_role";



GRANT ALL ON TABLE "public"."online_channels" TO "anon";
GRANT ALL ON TABLE "public"."online_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."online_channels" TO "service_role";



GRANT ALL ON TABLE "public"."online_order_reconciliations" TO "anon";
GRANT ALL ON TABLE "public"."online_order_reconciliations" TO "authenticated";
GRANT ALL ON TABLE "public"."online_order_reconciliations" TO "service_role";



GRANT ALL ON TABLE "public"."order_discount_applications" TO "anon";
GRANT ALL ON TABLE "public"."order_discount_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."order_discount_applications" TO "service_role";



GRANT ALL ON TABLE "public"."order_holds" TO "anon";
GRANT ALL ON TABLE "public"."order_holds" TO "authenticated";
GRANT ALL ON TABLE "public"."order_holds" TO "service_role";



GRANT ALL ON TABLE "public"."order_item_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."order_item_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."order_item_modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."order_item_moves" TO "anon";
GRANT ALL ON TABLE "public"."order_item_moves" TO "authenticated";
GRANT ALL ON TABLE "public"."order_item_moves" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_payments" TO "anon";
GRANT ALL ON TABLE "public"."order_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."order_payments" TO "service_role";



GRANT ALL ON TABLE "public"."order_refunds" TO "anon";
GRANT ALL ON TABLE "public"."order_refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."order_refunds" TO "service_role";



GRANT ALL ON TABLE "public"."order_split_items" TO "anon";
GRANT ALL ON TABLE "public"."order_split_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_split_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_splits" TO "anon";
GRANT ALL ON TABLE "public"."order_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."order_splits" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_history" TO "anon";
GRANT ALL ON TABLE "public"."order_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."order_transfers" TO "anon";
GRANT ALL ON TABLE "public"."order_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."order_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payment_gateway_configs" TO "anon";
GRANT ALL ON TABLE "public"."payment_gateway_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_gateway_configs" TO "service_role";



GRANT ALL ON TABLE "public"."payment_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."plan_features" TO "anon";
GRANT ALL ON TABLE "public"."plan_features" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_features" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."plugin_catalog" TO "anon";
GRANT ALL ON TABLE "public"."plugin_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."plugin_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."plugin_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."plugin_logs" TO "service_role";



GRANT ALL ON TABLE "public"."plugin_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."plugin_settings" TO "service_role";



GRANT ALL ON TABLE "public"."plugins" TO "authenticated";
GRANT ALL ON TABLE "public"."plugins" TO "service_role";



GRANT ALL ON TABLE "public"."pos_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."pos_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."pos_terminals" TO "anon";
GRANT ALL ON TABLE "public"."pos_terminals" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_terminals" TO "service_role";



GRANT ALL ON TABLE "public"."print_jobs" TO "anon";
GRANT ALL ON TABLE "public"."print_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."print_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."printer_devices" TO "anon";
GRANT ALL ON TABLE "public"."printer_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."printer_devices" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."referral_codes" TO "anon";
GRANT ALL ON TABLE "public"."referral_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_codes" TO "service_role";



GRANT ALL ON TABLE "public"."referral_events" TO "anon";
GRANT ALL ON TABLE "public"."referral_events" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_events" TO "service_role";



GRANT ALL ON TABLE "public"."report_exports" TO "anon";
GRANT ALL ON TABLE "public"."report_exports" TO "authenticated";
GRANT ALL ON TABLE "public"."report_exports" TO "service_role";



GRANT ALL ON TABLE "public"."report_schedules" TO "anon";
GRANT ALL ON TABLE "public"."report_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."report_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_deposits" TO "anon";
GRANT ALL ON TABLE "public"."reservation_deposits" TO "authenticated";
GRANT ALL ON TABLE "public"."reservation_deposits" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_reminders" TO "anon";
GRANT ALL ON TABLE "public"."reservation_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."reservation_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_waitlist" TO "anon";
GRANT ALL ON TABLE "public"."reservation_waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."reservation_waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_aggregator_accounts" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_aggregator_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_aggregator_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_approval_decisions" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_approval_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_approval_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_approval_requests" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_approval_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_approval_requests" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_areas" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_areas" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_banners" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_branches" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_branches" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_branches" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_campaign_runs" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_campaign_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_campaign_runs" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_captain_sessions" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_captain_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_captain_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_cash_movements" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_cash_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_cash_movements" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_cash_sessions" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_cash_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_cash_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_channels" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_channels" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_customer_segments" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_customer_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_customer_segments" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_daily_payment_summary" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_daily_payment_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_daily_payment_summary" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_display_events" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_display_events" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_display_events" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_floor_maps" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_floor_maps" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_floor_maps" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_hardware_devices" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_hardware_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_hardware_devices" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_integration_jobs" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_integration_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_integration_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_integrations" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_kiosk_sessions" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_kiosk_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_kiosk_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_loyalty_accounts" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_loyalty_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_loyalty_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_loyalty_transactions" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_loyalty_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_loyalty_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_menu_publications" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_menu_publications" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_menu_publications" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_menu_versions" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_menu_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_menu_versions" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_offline_queue" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_offline_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_offline_queue" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_payment_accounts" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_payment_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_payment_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_payment_settings" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_payment_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_payment_settings" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_plugins" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_plugins" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_purchase_items" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_purchase_items" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_purchase_items" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_purchases" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_recipe_items" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_recipe_items" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_recipe_items" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_recipes" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_report_runs" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_report_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_report_runs" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_reservation_events" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_reservation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_reservation_events" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_service_calls" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_service_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_service_calls" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_staff_shifts" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_staff_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_staff_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_table_layouts" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_table_layouts" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_table_layouts" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_terminals" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_terminals" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_terminals" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_virtual_brands" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_virtual_brands" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_virtual_brands" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_website_settings" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_website_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_website_settings" TO "service_role";



GRANT ALL ON TABLE "public"."restaurants" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurants" TO "service_role";



GRANT ALL ON TABLE "public"."review_replies" TO "anon";
GRANT ALL ON TABLE "public"."review_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."review_replies" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."saas_plans" TO "anon";
GRANT ALL ON TABLE "public"."saas_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_plans" TO "service_role";



GRANT ALL ON TABLE "public"."scan_pay_requests" TO "anon";
GRANT ALL ON TABLE "public"."scan_pay_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_pay_requests" TO "service_role";



GRANT ALL ON TABLE "public"."self_service_kiosks" TO "anon";
GRANT ALL ON TABLE "public"."self_service_kiosks" TO "authenticated";
GRANT ALL ON TABLE "public"."self_service_kiosks" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."sms_campaign_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."sms_campaign_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_campaign_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."staff_attendance" TO "anon";
GRANT ALL ON TABLE "public"."staff_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."staff_attendance_events" TO "anon";
GRANT ALL ON TABLE "public"."staff_attendance_events" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_attendance_events" TO "service_role";



GRANT ALL ON TABLE "public"."staff_breaks" TO "anon";
GRANT ALL ON TABLE "public"."staff_breaks" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_breaks" TO "service_role";



GRANT ALL ON TABLE "public"."staff_pay_rules" TO "anon";
GRANT ALL ON TABLE "public"."staff_pay_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_pay_rules" TO "service_role";



GRANT ALL ON TABLE "public"."staff_permissions" TO "anon";
GRANT ALL ON TABLE "public"."staff_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."stock_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_usage" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_payments" TO "anon";
GRANT ALL ON TABLE "public"."supplier_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_payments" TO "service_role";



GRANT ALL ON TABLE "public"."table_sessions" TO "anon";
GRANT ALL ON TABLE "public"."table_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."table_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."website_order_settings" TO "anon";
GRANT ALL ON TABLE "public"."website_order_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."website_order_settings" TO "service_role";



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







