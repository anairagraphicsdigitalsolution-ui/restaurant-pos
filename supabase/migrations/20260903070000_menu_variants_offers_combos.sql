BEGIN;

ALTER TABLE public.offer_products ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.menu_variants(id) ON DELETE SET NULL;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS get_product_variant_id uuid REFERENCES public.menu_variants(id) ON DELETE SET NULL;

ALTER TABLE public.offer_products ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.offer_products SET id=gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.offer_products ALTER COLUMN id SET NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='offer_products_pkey') THEN
    ALTER TABLE public.offer_products DROP CONSTRAINT offer_products_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='offer_products_pkey_id') THEN
    ALTER TABLE public.offer_products ADD CONSTRAINT offer_products_pkey_id PRIMARY KEY (id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_products_target ON public.offer_products (offer_id,menu_item_id,COALESCE(variant_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_offer_products_variant ON public.offer_products(menu_item_id,variant_id);
CREATE INDEX IF NOT EXISTS idx_offers_get_product_variant ON public.offers(get_product_id,get_product_variant_id);

CREATE OR REPLACE FUNCTION public.calculate_offer_discount(
  p_offer_id uuid,
  p_order_id uuid,
  p_subtotal numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_offer public.offers%ROWTYPE;
  v_eligible numeric(12,2):=0;
  v_discount numeric(12,2):=0;
  v_type text;
  v_value numeric(12,2);
  v_used integer:=0;
  v_customer public.customers%ROWTYPE;
  v_tier_name text;
  v_now_local timestamp:=now() AT TIME ZONE 'Asia/Kolkata';
  v_local_date date:=v_now_local::date;
  v_day integer:=EXTRACT(ISODOW FROM v_now_local);
  v_days text;
  v_qty integer:=0;
  v_buy integer:=1;
  v_get integer:=1;
  v_free_price numeric(12,2):=0;
BEGIN
  SELECT * INTO v_offer FROM public.offers WHERE id=p_offer_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF COALESCE(v_offer.active,true)=false
     OR (v_offer.valid_from IS NOT NULL AND v_offer.valid_from>v_local_date)
     OR (v_offer.valid_till IS NOT NULL AND v_offer.valid_till<v_local_date)
     OR COALESCE(v_offer.min_order,0)>COALESCE(p_subtotal,0) THEN
    RETURN 0;
  END IF;

  v_days:=NULLIF(TRIM(COALESCE(v_offer.days_of_week,'')),'');
  IF v_days IS NOT NULL AND POSITION(','||v_day::text||',' IN ','||v_days||',')=0 THEN RETURN 0; END IF;
  IF v_offer.start_time IS NOT NULL AND v_now_local::time<v_offer.start_time THEN RETURN 0; END IF;
  IF v_offer.end_time IS NOT NULL AND v_now_local::time>v_offer.end_time THEN RETURN 0; END IF;

  IF v_offer.usage_limit IS NOT NULL THEN
    -- Usage is consumed by completed/paid bills, not by the order currently
    -- being billed. QR/web orders may carry offer_id before payment/finalization.
    -- Counting the current order here makes a usage_limit=1 offer disappear
    -- at the exact moment the operator tries to finalize the bill.
    SELECT COUNT(*) INTO v_used
    FROM public.orders
    WHERE offer_id=v_offer.id
      AND id <> p_order_id
      AND COALESCE(status,'') NOT IN ('cancelled','canceled')
      AND lower(COALESCE(payment_status,'')) = 'paid';
    IF v_used>=v_offer.usage_limit THEN RETURN 0; END IF;
  END IF;

  IF COALESCE(v_offer.new_customer_only,false)
     OR NULLIF(TRIM(COALESCE(v_offer.customer_tier,'')),'') IS NOT NULL THEN
    SELECT c.* INTO v_customer FROM public.customers c
    JOIN public.orders o ON o.customer_id=c.id
    WHERE o.id=p_order_id LIMIT 1;
    IF v_customer.id IS NULL THEN RETURN 0; END IF;
    IF COALESCE(v_offer.new_customer_only,false) AND COALESCE(v_customer.total_orders,0)>0 THEN RETURN 0; END IF;
    IF NULLIF(TRIM(COALESCE(v_offer.customer_tier,'')),'') IS NOT NULL THEN
      SELECT t.name INTO v_tier_name FROM public.loyalty_tiers t
      WHERE t.restaurant_id=v_customer.restaurant_id AND t.active=true
        AND t.min_points<=COALESCE(v_customer.loyalty_points,0)
      ORDER BY t.min_points DESC LIMIT 1;
      IF lower(COALESCE(v_tier_name,''))<>lower(COALESCE(v_offer.customer_tier,'')) THEN RETURN 0; END IF;
    END IF;
  END IF;

  -- Normal offers never discount combo menu items. A combo's configured
  -- selling price is already the price the customer is buying.
  -- This rule is enforced here because this function is shared by Billing
  -- preview, Billing finalize, app orders, and other server-side flows.
  IF COALESCE(v_offer.target_type,'all')='products' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total,oi.unit_price*oi.quantity)),0) INTO v_eligible
    FROM public.order_items oi
    JOIN public.offer_products op ON op.menu_item_id=oi.item_id
    JOIN public.menu_items mi ON mi.id=oi.item_id
    WHERE oi.order_id=p_order_id
      AND op.offer_id=v_offer.id
      AND (op.variant_id IS NULL OR op.variant_id=oi.variant_id)
      AND COALESCE(mi.item_type,'single') <> 'combo';
  ELSIF COALESCE(v_offer.target_type,'all')='category' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total,oi.unit_price*oi.quantity)),0) INTO v_eligible
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id=oi.item_id
    WHERE oi.order_id=p_order_id
      AND mi.category=v_offer.target_category
      AND COALESCE(mi.item_type,'single') <> 'combo';
  ELSE
    SELECT COALESCE(SUM(COALESCE(oi.line_total,oi.unit_price*oi.quantity)),0) INTO v_eligible
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id=oi.item_id
    WHERE oi.order_id=p_order_id
      AND COALESCE(mi.item_type,'single') <> 'combo';
  END IF;

  v_eligible:=GREATEST(v_eligible,0);
  v_type:=lower(COALESCE(v_offer.offer_type,'discount'));
  v_value:=GREATEST(COALESCE(v_offer.discount,0),0);

  IF v_type IN ('bogo','buy_get') THEN
    v_buy:=GREATEST(COALESCE(v_offer.buy_quantity,1),1);
    v_get:=GREATEST(COALESCE(v_offer.get_quantity,1),1);
    IF v_offer.get_product_id IS NOT NULL THEN
      SELECT COALESCE(SUM(oi.quantity),0),COALESCE(MIN(oi.unit_price),0) INTO v_qty,v_free_price
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id=oi.item_id
      WHERE oi.order_id=p_order_id
        AND oi.item_id=v_offer.get_product_id
        AND (v_offer.get_product_variant_id IS NULL OR oi.variant_id=v_offer.get_product_variant_id)
        AND COALESCE(mi.item_type,'single') <> 'combo';
    ELSE
      SELECT COALESCE(SUM(oi.quantity),0),COALESCE(MIN(oi.unit_price),0) INTO v_qty,v_free_price
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id=oi.item_id
      WHERE oi.order_id=p_order_id
        AND COALESCE(mi.item_type,'single') <> 'combo';
    END IF;
    IF v_qty<v_buy+v_get OR v_free_price<=0 THEN RETURN 0; END IF;
    v_discount:=FLOOR(v_qty/(v_buy+v_get))*v_get*v_free_price;
  ELSIF v_type='free_item' THEN
    IF v_offer.get_product_id IS NULL THEN RETURN 0; END IF;
    SELECT COALESCE(MIN(oi.unit_price),0) INTO v_free_price FROM public.order_items oi
    WHERE oi.order_id=p_order_id AND oi.item_id=v_offer.get_product_id
      AND (v_offer.get_product_variant_id IS NULL OR oi.variant_id=v_offer.get_product_variant_id);
    IF v_free_price<=0 THEN
      SELECT COALESCE(mi.price,0) INTO v_free_price
      FROM public.menu_items mi
      WHERE mi.id=v_offer.get_product_id
        AND COALESCE(mi.item_type,'single') <> 'combo';
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

  IF v_offer.max_discount IS NOT NULL THEN v_discount:=LEAST(v_discount,GREATEST(v_offer.max_discount,0)); END IF;
  RETURN ROUND(GREATEST(v_discount,0),2);
END;
$function$;



REVOKE ALL ON FUNCTION public.calculate_offer_discount(uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_offer_discount(uuid,uuid,numeric) TO authenticated, service_role;

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
  v_variant_id uuid;
  v_variant_name text;
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
  v_line_price numeric(12,2);
  v_price_delta numeric(12,2);
  v_variant_delta numeric(12,2) := 0;
  v_option_found boolean;
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

    v_variant_id := NULL;
    v_variant_name := NULL;
    v_line_price := v_price;
    IF COALESCE(lower(v_type),'') <> 'combo' AND NULLIF(v_item->>'variant_id','') IS NOT NULL THEN
      BEGIN v_variant_id := (v_item->>'variant_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid variant'; END;
      SELECT mv.name, mv.price_delta INTO v_variant_name, v_price_delta
      FROM public.menu_variants mv
      WHERE mv.id=v_variant_id AND mv.menu_item_id=v_item_id AND mv.restaurant_id=v_restaurant.id AND mv.active=true
      LIMIT 1;
      IF v_variant_name IS NULL THEN RAISE EXCEPTION 'Selected variant is unavailable'; END IF;
      v_line_price := v_price + COALESCE(v_price_delta,0);
      IF v_line_price < 0 THEN RAISE EXCEPTION 'Item price cannot be negative'; END IF;
    END IF;

    IF v_type = 'combo' THEN
      v_component_names := '';
      IF jsonb_typeof(v_combo->'items') = 'array' THEN
        FOR v_component IN SELECT * FROM jsonb_array_elements(v_combo->'items') LOOP
          BEGIN v_component_id := NULLIF(v_component->>'item_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid combo component'; END;
          v_component_qty := COALESCE((v_component->>'quantity')::integer,1);
          v_variant_id := NULL; v_variant_name := NULL; v_price_delta := 0;
          IF NULLIF(v_component->>'variant_id','') IS NOT NULL THEN
            BEGIN v_variant_id := (v_component->>'variant_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid combo component variant'; END;
            SELECT mv.name,mv.price_delta INTO v_variant_name,v_price_delta FROM public.menu_variants mv WHERE mv.id=v_variant_id AND mv.menu_item_id=v_component_id AND mv.restaurant_id=v_restaurant.id AND mv.active=true LIMIT 1;
            IF v_variant_name IS NULL THEN RAISE EXCEPTION 'Combo component variant is unavailable'; END IF;
          END IF;
          SELECT mi.name INTO v_selected_name FROM public.menu_items mi WHERE mi.id=v_component_id AND mi.restaurant_id=v_restaurant.id LIMIT 1;
          IF v_selected_name IS NULL THEN RAISE EXCEPTION 'Combo component does not belong to restaurant'; END IF;
          v_line_price := v_line_price + COALESCE(v_price_delta,0) * v_component_qty;
          v_component_names := concat_ws(', ', NULLIF(v_component_names,''), format('%sx %s%s', v_component_qty, v_selected_name, CASE WHEN v_variant_name IS NOT NULL THEN format(' — %s',v_variant_name) ELSE '' END));
        END LOOP;
      END IF;

      IF jsonb_typeof(v_combo->'groups') = 'array' THEN
        v_selected := v_item->'combo_selection';
        IF v_selected IS NULL OR jsonb_typeof(v_selected) <> 'array' THEN
          RAISE EXCEPTION 'Please select combo options';
        END IF;

        -- The current editor exposes one choice group. The database remains
        -- authoritative: bounds and option pricing come from combo_config.
        IF jsonb_array_length(v_selected) < COALESCE(((v_combo->'groups'->0)->>'min')::integer,1)
           OR jsonb_array_length(v_selected) > COALESCE(((v_combo->'groups'->0)->>'max')::integer,1) THEN
          RAISE EXCEPTION 'Invalid number of combo options';
        END IF;

        v_line_price := v_price;

        FOR v_component IN SELECT * FROM jsonb_array_elements(v_selected) LOOP
          BEGIN
            v_component_id := NULLIF(v_component->>'item_id','')::uuid;
          EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid combo selection';
          END;

          v_option_found := false;
          v_price_delta := 0;

          SELECT true, COALESCE((opt->>'price_delta')::numeric,0)
            INTO v_option_found, v_price_delta
          FROM jsonb_array_elements(COALESCE(v_combo->'groups'->0->'options','[]'::jsonb)) opt
          WHERE opt->>'item_id' = v_component_id::text
            AND (opt->>'variant_id' IS NULL OR NULLIF(opt->>'variant_id','') IS NULL OR opt->>'variant_id' = NULLIF(v_component->>'variant_id',''))
          LIMIT 1;

          IF NOT COALESCE(v_option_found,false) THEN
            RAISE EXCEPTION 'Selected item is not available in this combo';
          END IF;

          SELECT mi.name
            INTO v_selected_name
          FROM public.menu_items mi
          WHERE mi.id=v_component_id
            AND mi.restaurant_id=v_restaurant.id
          LIMIT 1;

          IF v_selected_name IS NULL THEN
            RAISE EXCEPTION 'Invalid combo selection';
          END IF;

          v_variant_id := NULL; v_variant_name := NULL;
          IF NULLIF(v_component->>'variant_id','') IS NULL THEN
            SELECT NULLIF(opt->>'variant_id','')::uuid, opt->>'variant_name' INTO v_variant_id, v_variant_name
            FROM jsonb_array_elements(COALESCE(v_combo->'groups'->0->'options','[]'::jsonb)) opt
            WHERE opt->>'item_id'=v_component_id::text AND (opt->>'variant_id') IS NOT NULL LIMIT 1;
          ELSE
            BEGIN v_variant_id := (v_component->>'variant_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid combo selection variant'; END;
            SELECT mv.name,mv.price_delta INTO v_variant_name,v_price_delta FROM public.menu_variants mv WHERE mv.id=v_variant_id AND mv.menu_item_id=v_component_id AND mv.restaurant_id=v_restaurant.id AND mv.active=true LIMIT 1;
            IF v_variant_name IS NULL THEN RAISE EXCEPTION 'Selected combo variant is unavailable'; END IF;
          END IF;
          IF v_variant_id IS NOT NULL AND v_variant_name IS NULL THEN
            SELECT mv.name,mv.price_delta INTO v_variant_name,v_price_delta FROM public.menu_variants mv WHERE mv.id=v_variant_id AND mv.menu_item_id=v_component_id AND mv.restaurant_id=v_restaurant.id AND mv.active=true LIMIT 1;
            IF v_variant_name IS NULL THEN RAISE EXCEPTION 'Combo variant is unavailable'; END IF;
          END IF;
          v_line_price := v_line_price + COALESCE(v_price_delta,0) + COALESCE((SELECT (opt->>'price_delta')::numeric FROM jsonb_array_elements(COALESCE(v_combo->'groups'->0->'options','[]'::jsonb)) opt WHERE opt->>'item_id'=v_component_id::text LIMIT 1),0);
          v_component_names := concat_ws(', ', NULLIF(v_component_names,''), format('%s%s',v_selected_name, CASE WHEN v_variant_name IS NOT NULL THEN format(' — %s',v_variant_name) ELSE '' END));
        END LOOP;

        IF v_line_price < 0 THEN
          RAISE EXCEPTION 'Combo price cannot be negative';
        END IF;
      ELSE
        v_line_price := v_price;
      END IF;
    ELSE
      v_component_names := '';
    END IF;

    INSERT INTO public.order_items(order_id,item_id,variant_id,variant_name,quantity,cooking_request,item_name,unit_price,line_total)
    VALUES (
      v_order_id,
      v_item_id,
      CASE WHEN COALESCE(lower(v_type),'')='combo' THEN NULL ELSE v_variant_id END,
      CASE WHEN COALESCE(lower(v_type),'')='combo' THEN NULL ELSE v_variant_name END,
      v_qty,
      v_request,
      CASE WHEN COALESCE(lower(v_type),'')='combo' AND v_component_names<>'' THEN format('%s [%s]',v_name,v_component_names) WHEN v_variant_name IS NOT NULL THEN format('%s — %s',v_name,v_variant_name) ELSE v_name END,
      COALESCE(v_line_price, v_price),
      COALESCE(v_line_price, v_price)*v_qty
    );
    v_subtotal := v_subtotal + COALESCE(v_line_price, v_price)*v_qty;
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


-- Public website order: validate selected variant and calculate its effective price server-side.
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
  v_variant_id uuid;
  v_variant_name text;
  v_item_type text;
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
  v_combo jsonb;
  v_component jsonb;
  v_component_id uuid;
  v_selected jsonb;
  v_selected_name text;
  v_line_price numeric(12,2);
  v_price_delta numeric(12,2);
  v_variant_delta numeric(12,2) := 0;
  v_option_found boolean;
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

    SELECT mi.name, mi.price::numeric, mi.combo_config, COALESCE(mi.item_type,'single')
      INTO v_name, v_price, v_combo, v_item_type
    FROM public.menu_items mi
    WHERE mi.id = v_item_id
      AND mi.restaurant_id = v_restaurant.id
    LIMIT 1;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Menu item does not belong to restaurant';
    END IF;

    v_variant_id := NULL;
    v_variant_name := NULL;
    v_line_price := v_price;

    IF lower(coalesce(v_item_type,'single')) <> 'combo' AND NULLIF(v_item->>'variant_id','') IS NOT NULL THEN
      BEGIN v_variant_id := (v_item->>'variant_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid variant'; END;
      SELECT mv.name, mv.price_delta INTO v_variant_name, v_price_delta
      FROM public.menu_variants mv
      WHERE mv.id=v_variant_id AND mv.menu_item_id=v_item_id AND mv.restaurant_id=v_restaurant.id AND mv.active=true
      LIMIT 1;
      IF v_variant_name IS NULL THEN RAISE EXCEPTION 'Selected variant is unavailable'; END IF;
      v_line_price := v_price + COALESCE(v_price_delta,0);
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
        BEGIN
          v_component_id := NULLIF(v_component->>'item_id','')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'Invalid combo selection';
        END;

        v_option_found := false;
        v_price_delta := 0;
        v_variant_id := NULL; v_variant_name := NULL; v_variant_delta := 0;
        SELECT true, COALESCE((opt->>'price_delta')::numeric,0)
          INTO v_option_found, v_price_delta
        FROM jsonb_array_elements(COALESCE(v_combo->'groups'->0->'options','[]'::jsonb)) opt
        WHERE opt->>'item_id' = v_component_id::text
        LIMIT 1;

        IF NOT COALESCE(v_option_found,false) THEN
          RAISE EXCEPTION 'Selected item is not available in this combo';
        END IF;

        IF NULLIF(v_component->>'variant_id','') IS NOT NULL THEN
          BEGIN v_variant_id := (v_component->>'variant_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid combo selection variant'; END;
        ELSE
          SELECT NULLIF(opt->>'variant_id','')::uuid INTO v_variant_id
          FROM jsonb_array_elements(COALESCE(v_combo->'groups'->0->'options','[]'::jsonb)) opt
          WHERE opt->>'item_id'=v_component_id::text AND NULLIF(opt->>'variant_id','') IS NOT NULL
          LIMIT 1;
        END IF;

        IF v_variant_id IS NOT NULL THEN
          SELECT mv.name, mv.price_delta INTO v_variant_name, v_variant_delta
          FROM public.menu_variants mv
          WHERE mv.id=v_variant_id AND mv.menu_item_id=v_component_id AND mv.restaurant_id=v_restaurant.id AND mv.active=true
          LIMIT 1;
          IF v_variant_name IS NULL THEN RAISE EXCEPTION 'Combo variant is unavailable'; END IF;
        END IF;

        SELECT mi2.name INTO v_selected_name
        FROM public.menu_items mi2
        WHERE mi2.id=v_component_id
          AND mi2.restaurant_id=v_restaurant.id
        LIMIT 1;

        IF v_selected_name IS NULL THEN
          RAISE EXCEPTION 'Invalid combo selection';
        END IF;

        v_line_price := v_line_price + COALESCE(v_price_delta,0) + COALESCE(v_variant_delta,0);
      END LOOP;
    END IF;

    IF v_line_price < 0 THEN
      RAISE EXCEPTION 'Combo price cannot be negative';
    END IF;

    INSERT INTO public.order_items (
      order_id, item_id, variant_id, variant_name, quantity, cooking_request, item_name, unit_price, line_total
    ) VALUES (
      v_order_id, v_item_id, v_variant_id, v_variant_name, v_qty, v_request,
      CASE WHEN v_variant_name IS NOT NULL THEN format('%s — %s',v_name,v_variant_name) ELSE v_name END,
      v_line_price, v_line_price * v_qty
    );

    v_subtotal := v_subtotal + (v_line_price * v_qty);
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
  v_variant_id uuid;
  v_variant_name text;
  v_item_type text;
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
  v_combo jsonb;
  v_component jsonb;
  v_component_id uuid;
  v_selected jsonb;
  v_selected_name text;
  v_line_price numeric(12,2);
  v_price_delta numeric(12,2);
  v_variant_delta numeric(12,2) := 0;
  v_option_found boolean;
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

    SELECT mi.name, mi.price::numeric, mi.combo_config, COALESCE(mi.item_type,'single')
      INTO v_name, v_price, v_combo, v_item_type
    FROM public.menu_items mi
    WHERE mi.id = v_item_id
      AND mi.restaurant_id = v_restaurant.id
    LIMIT 1;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Menu item does not belong to restaurant';
    END IF;

    v_variant_id := NULL;
    v_variant_name := NULL;
    v_line_price := v_price;

    IF lower(coalesce(v_item_type,'single')) <> 'combo' AND NULLIF(v_item->>'variant_id','') IS NOT NULL THEN
      BEGIN v_variant_id := (v_item->>'variant_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid variant'; END;
      SELECT mv.name, mv.price_delta INTO v_variant_name, v_price_delta
      FROM public.menu_variants mv
      WHERE mv.id=v_variant_id AND mv.menu_item_id=v_item_id AND mv.restaurant_id=v_restaurant.id AND mv.active=true
      LIMIT 1;
      IF v_variant_name IS NULL THEN RAISE EXCEPTION 'Selected variant is unavailable'; END IF;
      v_line_price := v_price + COALESCE(v_price_delta,0);
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
        BEGIN
          v_component_id := NULLIF(v_component->>'item_id','')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'Invalid combo selection';
        END;

        v_option_found := false;
        v_price_delta := 0;
        v_variant_id := NULL; v_variant_name := NULL; v_variant_delta := 0;
        SELECT true, COALESCE((opt->>'price_delta')::numeric,0)
          INTO v_option_found, v_price_delta
        FROM jsonb_array_elements(COALESCE(v_combo->'groups'->0->'options','[]'::jsonb)) opt
        WHERE opt->>'item_id' = v_component_id::text
        LIMIT 1;

        IF NOT COALESCE(v_option_found,false) THEN
          RAISE EXCEPTION 'Selected item is not available in this combo';
        END IF;

        IF NULLIF(v_component->>'variant_id','') IS NOT NULL THEN
          BEGIN v_variant_id := (v_component->>'variant_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid combo selection variant'; END;
        ELSE
          SELECT NULLIF(opt->>'variant_id','')::uuid INTO v_variant_id
          FROM jsonb_array_elements(COALESCE(v_combo->'groups'->0->'options','[]'::jsonb)) opt
          WHERE opt->>'item_id'=v_component_id::text AND NULLIF(opt->>'variant_id','') IS NOT NULL
          LIMIT 1;
        END IF;

        IF v_variant_id IS NOT NULL THEN
          SELECT mv.name, mv.price_delta INTO v_variant_name, v_variant_delta
          FROM public.menu_variants mv
          WHERE mv.id=v_variant_id AND mv.menu_item_id=v_component_id AND mv.restaurant_id=v_restaurant.id AND mv.active=true
          LIMIT 1;
          IF v_variant_name IS NULL THEN RAISE EXCEPTION 'Combo variant is unavailable'; END IF;
        END IF;

        SELECT mi2.name INTO v_selected_name
        FROM public.menu_items mi2
        WHERE mi2.id=v_component_id
          AND mi2.restaurant_id=v_restaurant.id
        LIMIT 1;

        IF v_selected_name IS NULL THEN
          RAISE EXCEPTION 'Invalid combo selection';
        END IF;

        v_line_price := v_line_price + COALESCE(v_price_delta,0) + COALESCE(v_variant_delta,0);
      END LOOP;
    END IF;

    IF v_line_price < 0 THEN
      RAISE EXCEPTION 'Combo price cannot be negative';
    END IF;

    INSERT INTO public.order_items (
      order_id, item_id, variant_id, variant_name, quantity, cooking_request, item_name, unit_price, line_total
    ) VALUES (
      v_order_id, v_item_id, v_variant_id, v_variant_name, v_qty, v_request,
      CASE WHEN v_variant_name IS NOT NULL THEN format('%s — %s',v_name,v_variant_name) ELSE v_name END,
      v_line_price, v_line_price * v_qty
    );

    v_subtotal := v_subtotal + (v_line_price * v_qty);
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


REVOKE ALL ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) TO service_role, authenticated;


REVOKE ALL ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) TO service_role, authenticated;

REVOKE ALL ON FUNCTION public.create_public_website_order(text,text,uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_public_website_order(text,text,uuid,jsonb,text,text) TO service_role, authenticated;

COMMIT;
