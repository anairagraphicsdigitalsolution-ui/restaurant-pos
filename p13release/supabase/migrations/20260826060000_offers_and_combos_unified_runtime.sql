-- 20260826060000_offers_and_combos_master_plugin
-- Offers & Combos is one master plugin. Super Admin controls two independent
-- capabilities in plugin_settings.config: offers_enabled and combos_enabled.
-- If the master plugin is OFF, both capabilities are OFF server-side.

UPDATE public.plugin_catalog
SET name='Offers & Combos',
    description='Single master plugin for restaurant offers and combo meals. Super Admin controls Offers and Combos independently.'
WHERE code='offers';

UPDATE public.plugin_settings
SET config = COALESCE(config,'{}'::jsonb)
  || jsonb_build_object(
       'offers_enabled', COALESCE((config->>'offers_enabled')::boolean, true),
       'combos_enabled', COALESCE((config->>'combos_enabled')::boolean, true)
     )
WHERE plugin_code='offers';

-- 20260826050000_combo_runtime_pricing
-- Makes combo pricing authoritative in both QR and website order RPCs.
-- Clients send only item IDs/selections; price_delta is read from combo_config.

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
  v_option_found boolean;
  v_offer public.offers%ROWTYPE;
  v_requested_offer uuid;
  v_discount_type text;
  v_discount_value numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_offers_enabled boolean := false;
  v_combos_enabled boolean := false;
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

  SELECT
    COALESCE((ps.config->>'offers_enabled')::boolean, true),
    COALESCE((ps.config->>'combos_enabled')::boolean, true)
  INTO v_offers_enabled, v_combos_enabled
  FROM public.restaurant_plugins rp
  LEFT JOIN public.plugin_settings ps
    ON ps.restaurant_id = rp.restaurant_id AND ps.plugin_code = 'offers'
  WHERE rp.restaurant_id = v_restaurant.id
    AND rp.plugin_code = 'offers'
    AND rp.enabled = true
  LIMIT 1;

  v_offers_enabled := COALESCE(v_offers_enabled, false);
  v_combos_enabled := COALESCE(v_combos_enabled, false);

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
      IF NOT v_combos_enabled THEN
        RAISE EXCEPTION 'Combos are disabled for this restaurant';
      END IF;
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

          v_line_price := v_line_price + COALESCE(v_price_delta,0);
          v_component_names := concat_ws(', ', NULLIF(v_component_names,''), v_selected_name);
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

    INSERT INTO public.order_items(order_id,item_id,quantity,cooking_request,item_name,unit_price,line_total)
    VALUES (
      v_order_id,
      v_item_id,
      v_qty,
      v_request,
      CASE WHEN v_type='combo' AND v_component_names<>'' THEN format('%s [%s]',v_name,v_component_names) ELSE v_name END,
      COALESCE(v_line_price, v_price),
      COALESCE(v_line_price, v_price)*v_qty
    );
    v_subtotal := v_subtotal + COALESCE(v_line_price, v_price)*v_qty;
  END LOOP;

  IF v_offers_enabled AND v_requested_offer IS NOT NULL THEN
    SELECT * INTO v_offer FROM public.offers
    WHERE id=v_requested_offer AND restaurant_id=v_restaurant.id AND COALESCE(active,true)
      AND (valid_from IS NULL OR valid_from<=CURRENT_DATE) AND (valid_till IS NULL OR valid_till>=CURRENT_DATE)
      AND COALESCE(min_order,0)<=v_subtotal;
  END IF;

  IF v_offers_enabled AND v_offer.id IS NULL THEN
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
  v_type text;
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
  v_option_found boolean;
  v_offers_enabled boolean := false;
  v_combos_enabled boolean := false;
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

  SELECT
    COALESCE((ps.config->>'offers_enabled')::boolean, true),
    COALESCE((ps.config->>'combos_enabled')::boolean, true)
  INTO v_offers_enabled, v_combos_enabled
  FROM public.restaurant_plugins rp
  LEFT JOIN public.plugin_settings ps
    ON ps.restaurant_id = rp.restaurant_id AND ps.plugin_code = 'offers'
  WHERE rp.restaurant_id = v_restaurant.id
    AND rp.plugin_code = 'offers'
    AND rp.enabled = true
  LIMIT 1;

  v_offers_enabled := COALESCE(v_offers_enabled, false);
  v_combos_enabled := COALESCE(v_combos_enabled, false);

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
      INTO v_name, v_price, v_combo, v_type
    FROM public.menu_items mi
    WHERE mi.id = v_item_id
      AND mi.restaurant_id = v_restaurant.id
    LIMIT 1;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Menu item does not belong to restaurant';
    END IF;

    v_line_price := v_price;

    IF v_type = 'combo' AND NOT v_combos_enabled THEN
      RAISE EXCEPTION 'Combos are disabled for this restaurant';
    END IF;

    IF v_type = 'combo' AND jsonb_typeof(v_combo->'groups') = 'array' THEN
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
        SELECT true, COALESCE((opt->>'price_delta')::numeric,0)
          INTO v_option_found, v_price_delta
        FROM jsonb_array_elements(COALESCE(v_combo->'groups'->0->'options','[]'::jsonb)) opt
        WHERE opt->>'item_id' = v_component_id::text
        LIMIT 1;

        IF NOT COALESCE(v_option_found,false) THEN
          RAISE EXCEPTION 'Selected item is not available in this combo';
        END IF;

        SELECT mi2.name INTO v_selected_name
        FROM public.menu_items mi2
        WHERE mi2.id=v_component_id
          AND mi2.restaurant_id=v_restaurant.id
        LIMIT 1;

        IF v_selected_name IS NULL THEN
          RAISE EXCEPTION 'Invalid combo selection';
        END IF;

        v_line_price := v_line_price + COALESCE(v_price_delta,0);
      END LOOP;
    END IF;

    IF v_line_price < 0 THEN
      RAISE EXCEPTION 'Combo price cannot be negative';
    END IF;

    INSERT INTO public.order_items (
      order_id, item_id, quantity, cooking_request, item_name, unit_price, line_total
    ) VALUES (
      v_order_id, v_item_id, v_qty, v_request, v_name, v_line_price, v_line_price * v_qty
    );

    v_subtotal := v_subtotal + (v_line_price * v_qty);
  END LOOP;

  IF v_offers_enabled AND v_requested_offer IS NOT NULL THEN
    SELECT * INTO v_offer
    FROM public.offers
    WHERE id = v_requested_offer
      AND restaurant_id = v_restaurant.id
      AND public.calculate_offer_discount(id, v_order_id, v_subtotal) > 0;
  END IF;

  IF v_offers_enabled AND v_offer.id IS NULL THEN
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

REVOKE ALL ON FUNCTION public.create_public_website_order(text,text,uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_public_website_order(text,text,uuid,jsonb,text,text) TO service_role, authenticated;

-- Database guardrails: browser/admin writes cannot bypass Super Admin capability switches.
CREATE OR REPLACE FUNCTION public.offers_combos_capability_enabled(p_restaurant_id uuid, p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(p_capability,''))
    WHEN 'offers' THEN COALESCE((ps.config->>'offers_enabled')::boolean, true)
    WHEN 'combos' THEN COALESCE((ps.config->>'combos_enabled')::boolean, true)
    ELSE false
  END
  FROM public.restaurant_plugins rp
  LEFT JOIN public.plugin_settings ps
    ON ps.restaurant_id=rp.restaurant_id AND ps.plugin_code='offers'
  WHERE rp.restaurant_id=p_restaurant_id
    AND rp.plugin_code='offers'
    AND rp.enabled=true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.guard_offers_and_combos_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME='offers' THEN
    IF COALESCE(NEW.active,true) AND NOT COALESCE(public.offers_combos_capability_enabled(NEW.restaurant_id,'offers'),false) THEN
      RAISE EXCEPTION 'Offers are disabled by Super Admin';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME='menu_items' AND COALESCE(NEW.item_type,'single')='combo' THEN
    IF NOT COALESCE(public.offers_combos_capability_enabled(NEW.restaurant_id,'combos'),false) THEN
      RAISE EXCEPTION 'Combos are disabled by Super Admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_offers_plugin_write ON public.offers;
CREATE TRIGGER trg_guard_offers_plugin_write
BEFORE INSERT OR UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.guard_offers_and_combos_writes();

DROP TRIGGER IF EXISTS trg_guard_combos_plugin_write ON public.menu_items;
CREATE TRIGGER trg_guard_combos_plugin_write
BEFORE INSERT OR UPDATE OF item_type, combo_config, price ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.guard_offers_and_combos_writes();

REVOKE ALL ON FUNCTION public.offers_combos_capability_enabled(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offers_combos_capability_enabled(uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_offers_and_combos_writes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_offers_and_combos_writes() TO service_role;
