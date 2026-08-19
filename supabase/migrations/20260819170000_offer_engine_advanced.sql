-- Anaira POS Advanced Promotion Engine v2
-- Adds scheduling, coupons, BOGO/free-item offers, stacking controls,
-- priority and CRM eligibility. Inventory is intentionally untouched.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS offer_type text NOT NULL DEFAULT 'discount',
  ADD COLUMN IF NOT EXISTS buy_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS get_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS get_product_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS days_of_week text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stacking text NOT NULL DEFAULT 'best_only',
  ADD COLUMN IF NOT EXISTS customer_tier text,
  ADD COLUMN IF NOT EXISTS new_customer_only boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_offers_restaurant_coupon
  ON public.offers(restaurant_id, lower(coupon_code))
  WHERE coupon_code IS NOT NULL AND trim(coupon_code) <> '';

CREATE INDEX IF NOT EXISTS idx_offers_schedule
  ON public.offers(restaurant_id, active, valid_from, valid_till, priority DESC);

CREATE INDEX IF NOT EXISTS idx_offers_coupon
  ON public.offers(restaurant_id, lower(coupon_code));

ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS offers_offer_type_check;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_offer_type_check
  CHECK (offer_type IN ('discount','bogo','buy_get','free_item'));

ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS offers_stacking_check;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_stacking_check
  CHECK (stacking IN ('best_only','stackable','exclusive'));

-- Public QR order can now accept either an offer UUID or a coupon code.
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
  v_coupon text := NULLIF(lower(trim(coalesce(p_offer_id,''))), '');
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) < 1 OR length(trim(p_slug)) > 120 THEN RAISE EXCEPTION 'Invalid restaurant'; END IF;
  IF lower(trim(coalesce(p_type,''))) NOT IN ('table','room') THEN RAISE EXCEPTION 'Invalid QR type'; END IF;
  IF p_source_id IS NULL THEN RAISE EXCEPTION 'QR source is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN RAISE EXCEPTION 'Invalid order items'; END IF;

  SELECT * INTO v_restaurant FROM public.restaurants WHERE slug = trim(p_slug) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant not found'; END IF;

  IF lower(trim(p_type)) = 'table' THEN
    SELECT format('Table %s', table_number) INTO v_source_label FROM public.tables WHERE id = p_source_id AND restaurant_id = v_restaurant.id;
  ELSE
    SELECT format('Room %s', room_number) INTO v_source_label FROM public.rooms WHERE id = p_source_id AND restaurant_id = v_restaurant.id;
  END IF;
  IF v_source_label IS NULL THEN RAISE EXCEPTION 'QR source does not belong to restaurant'; END IF;

  BEGIN v_requested_offer := NULLIF(p_offer_id,'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_requested_offer := NULL; END;

  INSERT INTO public.orders (restaurant_id, source_type, source_id, source_label, status, overall_note)
  VALUES (v_restaurant.id, lower(trim(p_type)), p_source_id::text, v_source_label, 'pending', NULLIF(left(coalesce(p_overall_note,''),1000),''))
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_count := v_count + 1;
    BEGIN v_item_id := NULLIF(v_item->>'item_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid item at position %',v_count; END;
    v_qty := (v_item->>'quantity')::integer;
    v_request := NULLIF(left(coalesce(v_item->>'cooking_request',''),500),'');
    IF v_item_id IS NULL OR v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Invalid item at position %',v_count; END IF;
    SELECT mi.name, mi.price::numeric INTO v_name,v_price FROM public.menu_items mi WHERE mi.id=v_item_id AND mi.restaurant_id=v_restaurant.id LIMIT 1;
    IF v_name IS NULL THEN RAISE EXCEPTION 'Menu item does not belong to restaurant'; END IF;
    INSERT INTO public.order_items(order_id,item_id,quantity,cooking_request,item_name,unit_price,line_total)
    VALUES(v_order_id,v_item_id,v_qty,v_request,v_name,v_price,v_price*v_qty);
    v_subtotal := v_subtotal + v_price*v_qty;
  END LOOP;

  IF v_requested_offer IS NOT NULL THEN
    SELECT o.* INTO v_offer FROM public.offers o
    WHERE o.id=v_requested_offer AND o.restaurant_id=v_restaurant.id
      AND public.calculate_offer_discount(o.id,v_order_id,v_subtotal)>0;
  END IF;

  IF v_offer.id IS NULL AND v_coupon IS NOT NULL THEN
    SELECT o.* INTO v_offer FROM public.offers o
    WHERE o.restaurant_id=v_restaurant.id AND lower(trim(o.coupon_code))=v_coupon
      AND public.calculate_offer_discount(o.id,v_order_id,v_subtotal)>0
    ORDER BY o.priority DESC,o.created_at DESC LIMIT 1;
  END IF;

  IF v_offer.id IS NULL THEN
    SELECT o.* INTO v_offer FROM public.offers o
    WHERE o.restaurant_id=v_restaurant.id AND public.calculate_offer_discount(o.id,v_order_id,v_subtotal)>0
    ORDER BY CASE WHEN o.stacking='exclusive' THEN 0 ELSE 1 END, o.priority DESC,
      public.calculate_offer_discount(o.id,v_order_id,v_subtotal) DESC,o.created_at DESC LIMIT 1;
  END IF;

  IF v_offer.id IS NOT NULL THEN v_discount := public.calculate_offer_discount(v_offer.id,v_order_id,v_subtotal); END IF;

  IF COALESCE(v_restaurant.gst_enabled,true) THEN
    v_tax := ROUND(GREATEST(v_subtotal-v_discount,0)*GREATEST(COALESCE(v_restaurant.gst_rate,0),0)/100,2);
  END IF;
  v_total := ROUND(GREATEST(v_subtotal-v_discount,0)+v_tax,2);

  UPDATE public.orders SET subtotal=v_subtotal,discount_amount=v_discount,tax_amount=v_tax,total_amount=v_total,offer_id=v_offer.id WHERE id=v_order_id;

  RETURN jsonb_build_object('order_id',v_order_id,'restaurant_id',v_restaurant.id,'source_label',v_source_label,'subtotal',v_subtotal,'discount_amount',v_discount,'tax_amount',v_tax,'total_amount',v_total,'offer_id',v_offer.id,'offer_title',v_offer.title);
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) TO anon, authenticated, service_role;

-- Re-define the authoritative discount calculator after the new columns exist.
CREATE OR REPLACE FUNCTION public.calculate_offer_discount(
  p_offer_id uuid, p_order_id uuid, p_subtotal numeric
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_offer public.offers%ROWTYPE; v_eligible numeric(12,2):=0; v_discount numeric(12,2):=0;
  v_type text; v_value numeric(12,2); v_used integer:=0; v_customer public.customers%ROWTYPE;
  v_tier_name text; v_now_local timestamp:=now() AT TIME ZONE 'Asia/Kolkata'; v_day integer:=EXTRACT(ISODOW FROM v_now_local);
  v_days text; v_qty integer:=0; v_buy integer:=1; v_get integer:=1; v_free_price numeric(12,2):=0;
BEGIN
  SELECT * INTO v_offer FROM public.offers WHERE id=p_offer_id; IF NOT FOUND THEN RETURN 0; END IF;
  IF COALESCE(v_offer.active,true)=false OR (v_offer.valid_from IS NOT NULL AND v_offer.valid_from>CURRENT_DATE)
     OR (v_offer.valid_till IS NOT NULL AND v_offer.valid_till<CURRENT_DATE)
     OR COALESCE(v_offer.min_order,0)>COALESCE(p_subtotal,0) THEN RETURN 0; END IF;
  v_days:=NULLIF(TRIM(COALESCE(v_offer.days_of_week,'')),'');
  IF v_days IS NOT NULL AND POSITION(','||v_day::text||',' IN ','||v_days||',')=0 THEN RETURN 0; END IF;
  IF v_offer.start_time IS NOT NULL AND v_now_local::time<v_offer.start_time THEN RETURN 0; END IF;
  IF v_offer.end_time IS NOT NULL AND v_now_local::time>v_offer.end_time THEN RETURN 0; END IF;
  IF v_offer.usage_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used FROM public.orders WHERE offer_id=v_offer.id AND COALESCE(status,'')<>'cancelled';
    IF v_used>=v_offer.usage_limit THEN RETURN 0; END IF;
  END IF;
  IF COALESCE(v_offer.new_customer_only,false) OR NULLIF(TRIM(COALESCE(v_offer.customer_tier,'')),'') IS NOT NULL THEN
    SELECT c.* INTO v_customer FROM public.customers c JOIN public.orders o ON o.customer_id=c.id WHERE o.id=p_order_id LIMIT 1;
    IF v_customer.id IS NULL THEN RETURN 0; END IF;
    IF COALESCE(v_offer.new_customer_only,false) AND COALESCE(v_customer.total_orders,0)>0 THEN RETURN 0; END IF;
    IF NULLIF(TRIM(COALESCE(v_offer.customer_tier,'')),'') IS NOT NULL THEN
      SELECT t.name INTO v_tier_name FROM public.loyalty_tiers t WHERE t.restaurant_id=v_customer.restaurant_id AND t.active=true AND t.min_points<=COALESCE(v_customer.loyalty_points,0) ORDER BY t.min_points DESC LIMIT 1;
      IF lower(COALESCE(v_tier_name,''))<>lower(COALESCE(v_offer.customer_tier,'')) THEN RETURN 0; END IF;
    END IF;
  END IF;
  IF COALESCE(v_offer.target_type,'all')='products' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total,oi.unit_price*oi.quantity)),0) INTO v_eligible FROM public.order_items oi JOIN public.offer_products op ON op.menu_item_id=oi.item_id WHERE oi.order_id=p_order_id AND op.offer_id=v_offer.id;
  ELSIF COALESCE(v_offer.target_type,'all')='category' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total,oi.unit_price*oi.quantity)),0) INTO v_eligible FROM public.order_items oi JOIN public.menu_items mi ON mi.id=oi.item_id WHERE oi.order_id=p_order_id AND mi.category=v_offer.target_category;
  ELSE v_eligible:=COALESCE(p_subtotal,0); END IF;
  v_eligible:=GREATEST(v_eligible,0); IF v_eligible<=0 THEN RETURN 0; END IF;
  v_type:=lower(COALESCE(v_offer.offer_type,'discount')); v_value:=GREATEST(COALESCE(v_offer.discount,0),0);
  IF v_type IN ('bogo','buy_get') THEN
    v_buy:=GREATEST(COALESCE(v_offer.buy_quantity,1),1); v_get:=GREATEST(COALESCE(v_offer.get_quantity,1),1);
    IF v_offer.get_product_id IS NOT NULL THEN
      SELECT COALESCE(SUM(oi.quantity),0),COALESCE(MIN(oi.unit_price),0) INTO v_qty,v_free_price FROM public.order_items oi WHERE oi.order_id=p_order_id AND oi.item_id=v_offer.get_product_id;
    ELSE
      SELECT COALESCE(SUM(oi.quantity),0),COALESCE(MIN(oi.unit_price),0) INTO v_qty,v_free_price FROM public.order_items oi WHERE oi.order_id=p_order_id;
    END IF;
    IF v_qty<v_buy+v_get THEN RETURN 0; END IF; v_discount:=FLOOR(v_qty/(v_buy+v_get))*v_get*v_free_price;
  ELSIF v_type='free_item' THEN
    IF v_offer.get_product_id IS NULL THEN RETURN 0; END IF;
    SELECT COALESCE(MIN(oi.unit_price),0) INTO v_free_price FROM public.order_items oi WHERE oi.order_id=p_order_id AND oi.item_id=v_offer.get_product_id;
    IF v_free_price<=0 THEN SELECT COALESCE(mi.price,0) INTO v_free_price FROM public.menu_items mi WHERE mi.id=v_offer.get_product_id; END IF;
    v_discount:=v_free_price*GREATEST(COALESCE(v_offer.get_quantity,1),1);
  ELSIF lower(COALESCE(v_offer.discount_type,'percent'))='flat' THEN v_discount:=LEAST(v_eligible,v_value);
  ELSE v_discount:=LEAST(v_eligible,v_eligible*LEAST(v_value,100)/100); END IF;
  IF v_offer.max_discount IS NOT NULL THEN v_discount:=LEAST(v_discount,GREATEST(v_offer.max_discount,0)); END IF;
  RETURN ROUND(GREATEST(v_discount,0),2);
END; $$;
REVOKE ALL ON FUNCTION public.calculate_offer_discount(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calculate_offer_discount(uuid,uuid,numeric) TO authenticated,service_role;
