-- Combo offer exclusion: combo menu items never receive normal offers.
-- Normal menu items keep the existing offer engine unchanged.
-- This is intentionally a new forward-only migration; it does not rewrite data.

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
    WHERE oi.order_id=p_order_id AND oi.item_id=v_offer.get_product_id;
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


DO $$ BEGIN
  IF to_regprocedure('public.calculate_offer_discount(uuid,uuid,numeric)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.calculate_offer_discount(uuid,uuid,numeric) OWNER TO postgres';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.calculate_offer_discount(uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_offer_discount(uuid,uuid,numeric) TO authenticated, service_role;
