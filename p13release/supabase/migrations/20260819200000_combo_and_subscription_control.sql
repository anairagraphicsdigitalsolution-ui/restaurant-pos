-- Anaira POS: Combo Meals + enforceable SaaS subscriptions.
-- Inventory is intentionally untouched.

-- ------------------------------------------------------------
-- Combo meals stored as menu items so existing menu/order/billing
-- pipelines remain compatible.
-- ------------------------------------------------------------
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'single';

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS combo_config jsonb;

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_type
  ON public.menu_items(restaurant_id, item_type);

-- ------------------------------------------------------------
-- Subscription lifecycle
-- pending = created but not approved; restaurant must remain inactive.
-- active  = approved subscription; restaurant can be active.
-- ------------------------------------------------------------
ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.saas_plans(id) ON DELETE SET NULL;

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly';

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS starts_at timestamptz;

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Older projects may have a differently named status CHECK constraint.
-- Remove only CHECK constraints that validate this table's status column,
-- then install the lifecycle constraint used by the current application.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'restaurant_subscriptions'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.restaurant_subscriptions DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.restaurant_subscriptions
  DROP CONSTRAINT IF EXISTS restaurant_subscriptions_status_check;

ALTER TABLE public.restaurant_subscriptions
  DROP CONSTRAINT IF EXISTS restaurant_subscriptions_billing_cycle_check;
ALTER TABLE public.restaurant_subscriptions
  ADD CONSTRAINT restaurant_subscriptions_billing_cycle_check CHECK (billing_cycle IN ('monthly','yearly'));

ALTER TABLE public.restaurant_subscriptions
  ADD CONSTRAINT restaurant_subscriptions_status_check
  CHECK (status IN ('pending','trial','active','past_due','cancelled','expired'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_active_restaurant
  ON public.restaurant_subscriptions(restaurant_id, status, updated_at DESC);

-- One current lifecycle record per restaurant. Existing duplicates are left
-- untouched; the application always uses the most recently updated record.

-- ------------------------------------------------------------
-- Plan feature gate used by server APIs.
-- A restaurant is considered enabled only when BOTH restaurant.status and
-- its subscription are active.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_restaurant_plan_feature(
  p_restaurant_id uuid,
  p_plugin_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
  JOIN public.saas_plans sp ON sp.id = rs.plan_id
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

REVOKE ALL ON FUNCTION public.has_restaurant_plan_feature(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_restaurant_plan_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_restaurant_plan_feature(uuid, text) TO service_role;

-- ------------------------------------------------------------
-- Return the current subscription + plan for authenticated restaurant users.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_restaurant_plan(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
  LEFT JOIN public.saas_plans sp ON sp.id = rs.plan_id
  WHERE rs.restaurant_id = p_restaurant_id
  ORDER BY rs.updated_at DESC NULLS LAST, rs.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_result, jsonb_build_object('subscription', null, 'plan', null));
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_plan(uuid) TO service_role;

-- ------------------------------------------------------------
-- Seed a slightly richer plan capability set without changing prices.
-- ------------------------------------------------------------
UPDATE public.saas_plans SET
  qr_ordering = true,
  loyalty = CASE WHEN name IN ('Professional','Enterprise') THEN true ELSE false END,
  offers = CASE WHEN name IN ('Professional','Enterprise') THEN true ELSE false END,
  analytics = CASE WHEN name IN ('Professional','Enterprise') THEN true ELSE false END,
  reservations = CASE WHEN name IN ('Professional','Enterprise') THEN true ELSE false END,
  whatsapp = CASE WHEN name IN ('Professional','Enterprise') THEN true ELSE false END
WHERE name IN ('Starter','Professional','Enterprise');

-- ------------------------------------------------------------
-- Helper trigger: never allow an active subscription to leave a restaurant
-- inactive. Deactivation is still available manually from Super Admin.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_restaurant_status_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.plan_id IS NOT NULL THEN
    UPDATE public.restaurants SET status = 'active' WHERE id = NEW.restaurant_id;
  ELSIF NEW.status IN ('pending','past_due','cancelled','expired') THEN
    UPDATE public.restaurants SET status = 'inactive' WHERE id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_restaurant_subscription_status ON public.restaurant_subscriptions;
CREATE TRIGGER trg_sync_restaurant_subscription_status
AFTER INSERT OR UPDATE OF status, plan_id, starts_at, ends_at
ON public.restaurant_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_restaurant_status_from_subscription();

-- ------------------------------------------------------------
-- Public QR order RPC: combo-aware and subscription-aware.
-- Existing signature is preserved.
-- ------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) TO service_role;
