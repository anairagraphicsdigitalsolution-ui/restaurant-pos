-- Canonical 20260826080000 migration.
-- Merges the original billing/notification hardening and India timezone runtime.
-- The two source migrations shared a version but contained different changes.
-- This canonical file preserves both change sets under one migration version.

-- Final billing retry + notification runtime hardening.
-- Non-destructive: no orders/payments are deleted or rewritten.

-- Remove legacy order-level idempotency markers that point to partial
-- responses. They are not payment records and can safely be recreated.
DELETE FROM public.billing_idempotency_keys
WHERE idempotency_key LIKE 'billing-finalize:%'
  AND status='completed'
  AND COALESCE(response->'bill'->>'payment_status', response->>'payment_status', '') <> 'paid';

-- The 8-argument Billing finalize API is the terminal "Finalize & Generate Invoice"
-- operation. Partial payments are supported by the legacy 6-argument RPC, but
-- this billing-screen overload must never mark a partial collection as a final
-- bill. A second finalize can still collect the remaining balance because the
-- existing paid ledger is included in v_existing_paid.

CREATE OR REPLACE FUNCTION public.stage3_finalize_order(
  p_actor_id uuid,
  p_order_id uuid,
  p_payment_method text DEFAULT 'cash'::text,
  p_paid_amount numeric DEFAULT 0,
  p_offer_id uuid DEFAULT NULL::uuid,
  p_loyalty_reward_id uuid DEFAULT NULL::uuid,
  p_manual_discount_amount numeric DEFAULT 0,
  p_manual_discount_mode text DEFAULT 'amount'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
  v_payment_received numeric(12,2) := GREATEST(COALESCE(p_paid_amount,0),0);
  v_existing_paid numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_payment_status text;
  v_invoice_seq bigint;
  v_invoice_no text;
  v_delivery_charge numeric(12,2) := 0;
  v_loyalty_reward public.loyalty_rewards%ROWTYPE;
  v_loyalty_discount numeric(12,2) := 0;
  v_loyalty_points_redeemed integer := 0;
  v_manual_discount numeric(12,2) := GREATEST(COALESCE(p_manual_discount_amount,0),0);
  v_manual_discount_mode text := lower(COALESCE(p_manual_discount_mode,'amount'));
BEGIN
  SELECT * INTO v_profile FROM public.stage3_profile_for_actor(p_actor_id);
  IF v_profile.user_id IS NULL OR v_profile.role NOT IN ('admin','staff','super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_profile.role <> 'super_admin' AND v_order.restaurant_id <> v_profile.restaurant_id THEN
    RAISE EXCEPTION 'Order belongs to another restaurant';
  END IF;
  IF v_order.status='cancelled' THEN RAISE EXCEPTION 'Cancelled order cannot be billed'; END IF;

  IF COALESCE(v_order.payment_status,'unpaid')='paid' THEN
    RETURN jsonb_build_object(
      'order_id',v_order.id,'invoice_no',v_order.invoice_no,
      'subtotal',COALESCE(v_order.subtotal,0),'discount',COALESCE(v_order.discount_amount,0),
      'tax',COALESCE(v_order.tax_amount,0),'delivery_charge',COALESCE(v_order.delivery_charge,0),
      'loyalty_reward_id',NULL,'loyalty_points_redeemed',0,'loyalty_discount',0,
      'total',COALESCE(v_order.total_amount,0),'paid_amount',COALESCE(v_order.paid_amount,0),
      'payment_received',0,'payment_status','paid',
      'payment_method',COALESCE(v_order.payment_method,p_payment_method),
      'offer_id',v_order.offer_id
    );
  END IF;

  SELECT * INTO v_restaurant FROM public.restaurants WHERE id=v_order.restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant not found'; END IF;

  FOR v_item IN
    SELECT oi.id,oi.item_id,oi.quantity,oi.unit_price,mi.name,mi.price
    FROM public.order_items oi
    LEFT JOIN public.menu_items mi ON mi.id=oi.item_id
    WHERE oi.order_id=v_order.id
    FOR UPDATE OF oi
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity<1 THEN RAISE EXCEPTION 'Invalid order quantity'; END IF;
    IF v_item.unit_price IS NULL THEN
      IF v_item.price IS NULL THEN RAISE EXCEPTION 'Menu price missing for order item'; END IF;
      UPDATE public.order_items
      SET item_name=COALESCE(item_name,v_item.name),unit_price=v_item.price,
          line_total=v_item.price*v_item.quantity
      WHERE id=v_item.id;
    ELSE
      UPDATE public.order_items
      SET line_total=COALESCE(line_total,unit_price*quantity),item_name=COALESCE(item_name,v_item.name)
      WHERE id=v_item.id;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(
    COALESCE(oi.line_total,oi.unit_price*oi.quantity)
    + COALESCE((SELECT SUM(COALESCE(oim.price,0)*COALESCE(oim.quantity,1))
                FROM public.order_item_modifiers oim
                WHERE oim.order_item_id=oi.id),0)*oi.quantity
  ),0) INTO v_subtotal
  FROM public.order_items oi WHERE oi.order_id=v_order.id;

  IF p_offer_id IS NOT NULL THEN
    SELECT * INTO v_offer FROM public.offers
    WHERE id=p_offer_id AND restaurant_id=v_order.restaurant_id;
    IF v_offer.id IS NOT NULL THEN
      v_discount:=public.calculate_offer_discount(v_offer.id,v_order.id,v_subtotal);
      IF v_discount<=0 THEN v_offer:=NULL; v_discount:=0; END IF;
    END IF;
  END IF;

  IF v_offer.id IS NULL THEN
    SELECT o.* INTO v_offer FROM public.offers o
    WHERE o.restaurant_id=v_order.restaurant_id
      AND public.calculate_offer_discount(o.id,v_order.id,v_subtotal)>0
    ORDER BY CASE WHEN o.stacking='exclusive' THEN 0 ELSE 1 END,
             o.priority DESC,
             public.calculate_offer_discount(o.id,v_order.id,v_subtotal) DESC,
             o.created_at DESC LIMIT 1;
    IF v_offer.id IS NOT NULL THEN
      v_discount:=public.calculate_offer_discount(v_offer.id,v_order.id,v_subtotal);
    END IF;
  END IF;

  IF v_manual_discount>0 THEN
    IF v_manual_discount_mode='percent' THEN
      v_discount:=LEAST(v_subtotal,ROUND(v_subtotal*LEAST(v_manual_discount,100)/100,2));
    ELSE
      v_discount:=LEAST(v_subtotal,v_manual_discount);
    END IF;
    v_offer:=NULL;
  END IF;

  IF p_loyalty_reward_id IS NOT NULL THEN
    IF v_order.customer_id IS NULL THEN RAISE EXCEPTION 'A customer is required to redeem loyalty points'; END IF;
    SELECT * INTO v_loyalty_reward FROM public.loyalty_rewards
    WHERE id=p_loyalty_reward_id AND restaurant_id=v_order.restaurant_id AND active=true FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty reward is not active or does not belong to this restaurant'; END IF;
    IF v_loyalty_reward.reward_type='free_item' THEN
      RAISE EXCEPTION 'This free-item loyalty reward cannot be redeemed from billing because it has no menu item configured';
    END IF;
    IF v_subtotal<COALESCE(v_loyalty_reward.min_order_amount,0) THEN
      RAISE EXCEPTION 'Minimum order value for this loyalty reward is not met';
    END IF;
    IF v_loyalty_reward.usage_limit IS NOT NULL AND COALESCE(v_loyalty_reward.used_count,0)>=v_loyalty_reward.usage_limit THEN
      RAISE EXCEPTION 'Loyalty reward usage limit reached';
    END IF;
    SELECT COALESCE(c.loyalty_points,0) INTO v_loyalty_points_redeemed
    FROM public.customers c WHERE c.id=v_order.customer_id AND c.restaurant_id=v_order.restaurant_id FOR UPDATE;
    IF COALESCE(v_loyalty_points_redeemed,0)<v_loyalty_reward.points_cost THEN
      RAISE EXCEPTION 'Customer does not have enough loyalty points';
    END IF;
    v_loyalty_points_redeemed:=v_loyalty_reward.points_cost;
    IF lower(COALESCE(v_loyalty_reward.reward_type,'discount'))='percent' THEN
      v_loyalty_discount:=LEAST(GREATEST(v_subtotal-v_discount,0),
        ROUND(GREATEST(v_subtotal-v_discount,0)*LEAST(GREATEST(COALESCE(v_loyalty_reward.reward_value,0),0),100)/100,2));
    ELSE
      v_loyalty_discount:=LEAST(GREATEST(v_subtotal-v_discount,0),GREATEST(COALESCE(v_loyalty_reward.reward_value,0),0));
    END IF;
    v_discount:=LEAST(v_subtotal,ROUND(v_discount+v_loyalty_discount,2));
  END IF;

  v_delivery_charge:=GREATEST(COALESCE(v_order.delivery_charge,0),0);
  IF v_delivery_charge=0 AND COALESCE(v_order.order_mode,v_order.source_type)='delivery' THEN
    SELECT GREATEST(COALESCE(rd.delivery_charge,0),0) INTO v_delivery_charge
    FROM public.restaurant_deliveries rd WHERE rd.order_id=v_order.id
    ORDER BY rd.created_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF COALESCE(v_restaurant.gst_enabled,true) THEN
    v_tax:=ROUND(GREATEST(v_subtotal-v_discount,0)*GREATEST(COALESCE(v_restaurant.gst_rate,0),0)/100,2);
  END IF;
  v_total:=ROUND(GREATEST(v_subtotal-v_discount,0)+v_tax+v_delivery_charge,2);

  SELECT COALESCE(SUM(op.amount),0)-COALESCE((
    SELECT SUM(r.amount) FROM public.order_refunds r
    WHERE r.order_id=v_order.id AND COALESCE(r.status,'refunded')='refunded'
  ),0) INTO v_existing_paid
  FROM public.order_payments op
  WHERE op.order_id=v_order.id AND op.status='paid';
  v_existing_paid:=GREATEST(v_existing_paid,0);

  -- This overload is the terminal Billing "Finalize" action. It must collect
  -- the complete remaining balance. Existing partial payments are credited.
  IF v_total>0 AND v_existing_paid + v_payment_received < v_total THEN
    RAISE EXCEPTION 'Finalize requires full payment. Outstanding balance: ₹% ',
      ROUND(v_total-v_existing_paid-v_payment_received,2);
  END IF;

  v_payment_received:=LEAST(v_payment_received,GREATEST(v_total-v_existing_paid,0));
  v_paid:=LEAST(v_total,v_existing_paid+v_payment_received);
  IF v_paid>=v_total AND v_total>0 THEN v_payment_status:='paid';
  ELSIF v_paid>0 THEN v_payment_status:='partially_paid';
  ELSE v_payment_status:='unpaid';
  END IF;

  IF v_order.invoice_no IS NOT NULL AND trim(v_order.invoice_no)<>'' THEN
    v_invoice_no:=v_order.invoice_no;
  ELSE
    INSERT INTO public.invoice_sequences(restaurant_id,next_number)
    VALUES(v_order.restaurant_id,1) ON CONFLICT(restaurant_id) DO NOTHING;
    SELECT next_number INTO v_invoice_seq FROM public.invoice_sequences
    WHERE restaurant_id=v_order.restaurant_id FOR UPDATE;
    UPDATE public.invoice_sequences SET next_number=v_invoice_seq+1,updated_at=now()
    WHERE restaurant_id=v_order.restaurant_id;
    v_invoice_no:='INV-'||to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY')||'-'||lpad(v_invoice_seq::text,6,'0');
  END IF;

  UPDATE public.orders SET
    subtotal=v_subtotal,discount_amount=v_discount,tax_amount=v_tax,
    total_amount=v_total,delivery_charge=v_delivery_charge,
    offer_id=CASE WHEN v_offer.id IS NULL THEN NULL ELSE v_offer.id END,
    invoice_no=COALESCE(invoice_no,v_invoice_no),
    payment_status=v_payment_status,payment_method=NULLIF(left(lower(trim(COALESCE(p_payment_method,'cash'))),30),''),
    paid_amount=v_paid,billed_at=COALESCE(billed_at,now()),updated_at=now()
  WHERE id=v_order.id;

  IF v_payment_received>0 THEN
    INSERT INTO public.order_payments(
      restaurant_id,order_id,payment_method,amount,reference,status,paid_at,created_by,notes
    ) VALUES(
      v_order.restaurant_id,v_order.id,NULLIF(left(lower(trim(COALESCE(p_payment_method,'cash'))),30),''),
      v_payment_received,NULL,'paid',now(),v_profile.user_id,'Recorded by billing finalize'
    );
  END IF;

  IF p_loyalty_reward_id IS NOT NULL THEN
    UPDATE public.customers SET loyalty_points=GREATEST(COALESCE(loyalty_points,0)-v_loyalty_points_redeemed,0),updated_at=now()
    WHERE id=v_order.customer_id AND restaurant_id=v_order.restaurant_id;
    INSERT INTO public.loyalty_transactions(restaurant_id,customer_id,order_id,points,transaction_type,note)
    VALUES(v_order.restaurant_id,v_order.customer_id,v_order.id,-v_loyalty_points_redeemed,'redeem','Reward redeemed: '||v_loyalty_reward.name);
    INSERT INTO public.loyalty_redemptions(restaurant_id,customer_id,reward_id,order_id,points,discount_amount,status,created_by)
    VALUES(v_order.restaurant_id,v_order.customer_id,v_loyalty_reward.id,v_order.id,v_loyalty_points_redeemed,v_loyalty_discount,'redeemed',v_profile.user_id);

    UPDATE public.loyalty_rewards
    SET used_count=COALESCE(used_count,0)+1
    WHERE id=v_loyalty_reward.id AND restaurant_id=v_order.restaurant_id;
  END IF;

  INSERT INTO public.audit_logs(
    restaurant_id,actor_id,action,entity_type,entity_id,after_data
  ) VALUES(
    v_order.restaurant_id,v_profile.user_id,'order.finalize','order',v_order.id,
    jsonb_build_object(
      'invoice_no',COALESCE(v_order.invoice_no,v_invoice_no),
      'subtotal',v_subtotal,'discount',v_discount,'tax',v_tax,
      'delivery_charge',v_delivery_charge,'total',v_total,
      'paid_amount',v_paid,'payment_status',v_payment_status,
      'payment_method',p_payment_method
    )
  );

  RETURN jsonb_build_object(
    'order_id',v_order.id,'invoice_no',COALESCE(v_order.invoice_no,v_invoice_no),
    'subtotal',v_subtotal,'discount',v_discount,'tax',v_tax,'delivery_charge',v_delivery_charge,
    'loyalty_reward_id',CASE WHEN v_loyalty_reward.id IS NULL THEN NULL ELSE v_loyalty_reward.id END,
    'loyalty_points_redeemed',v_loyalty_points_redeemed,'loyalty_discount',v_loyalty_discount,
    'total',v_total,'paid_amount',v_paid,'payment_received',v_payment_received,
    'payment_status',v_payment_status,'payment_method',p_payment_method,'offer_id',v_offer.id,'manual_discount',v_manual_discount,'manual_discount_mode',v_manual_discount_mode
  );
END;
$function$;

ALTER FUNCTION public.stage3_finalize_order(uuid,uuid,text,numeric,uuid,uuid,numeric,text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.stage3_finalize_order(uuid,uuid,text,numeric,uuid,uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage3_finalize_order(uuid,uuid,text,numeric,uuid,uuid,numeric,text) TO service_role;

-- Ensure the global notification listener can receive inserts for the restaurant.
-- This is a safe RLS policy addition; it does not expose notification contents to anon.
DROP POLICY IF EXISTS notifications_realtime_select ON public.notifications;
CREATE POLICY notifications_realtime_select
ON public.notifications FOR SELECT TO authenticated
USING (
  restaurant_id = public.current_restaurant_id()
  OR public.is_super_admin()
);

-- Keep India-time date calculations consistent for offer validity.
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
    SELECT COUNT(*) INTO v_used FROM public.orders
    WHERE offer_id=v_offer.id AND COALESCE(status,'')<>'cancelled';
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

  IF COALESCE(v_offer.target_type,'all')='products' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total,oi.unit_price*oi.quantity)),0) INTO v_eligible
    FROM public.order_items oi JOIN public.offer_products op ON op.menu_item_id=oi.item_id
    WHERE oi.order_id=p_order_id AND op.offer_id=v_offer.id;
  ELSIF COALESCE(v_offer.target_type,'all')='category' THEN
    SELECT COALESCE(SUM(COALESCE(oi.line_total,oi.unit_price*oi.quantity)),0) INTO v_eligible
    FROM public.order_items oi JOIN public.menu_items mi ON mi.id=oi.item_id
    WHERE oi.order_id=p_order_id AND mi.category=v_offer.target_category;
  ELSE
    v_eligible:=COALESCE(p_subtotal,0);
  END IF;

  v_eligible:=GREATEST(v_eligible,0);
  v_type:=lower(COALESCE(v_offer.offer_type,'discount'));
  v_value:=GREATEST(COALESCE(v_offer.discount,0),0);

  IF v_type IN ('bogo','buy_get') THEN
    v_buy:=GREATEST(COALESCE(v_offer.buy_quantity,1),1);
    v_get:=GREATEST(COALESCE(v_offer.get_quantity,1),1);
    IF v_offer.get_product_id IS NOT NULL THEN
      SELECT COALESCE(SUM(oi.quantity),0),COALESCE(MIN(oi.unit_price),0) INTO v_qty,v_free_price
      FROM public.order_items oi WHERE oi.order_id=p_order_id AND oi.item_id=v_offer.get_product_id;
    ELSE
      SELECT COALESCE(SUM(oi.quantity),0),COALESCE(MIN(oi.unit_price),0) INTO v_qty,v_free_price
      FROM public.order_items oi WHERE oi.order_id=p_order_id;
    END IF;
    IF v_qty<v_buy+v_get OR v_free_price<=0 THEN RETURN 0; END IF;
    v_discount:=FLOOR(v_qty/(v_buy+v_get))*v_get*v_free_price;
  ELSIF v_type='free_item' THEN
    IF v_offer.get_product_id IS NULL THEN RETURN 0; END IF;
    SELECT COALESCE(MIN(oi.unit_price),0) INTO v_free_price FROM public.order_items oi
    WHERE oi.order_id=p_order_id AND oi.item_id=v_offer.get_product_id;
    IF v_free_price<=0 THEN
      SELECT COALESCE(mi.price,0) INTO v_free_price FROM public.menu_items mi WHERE mi.id=v_offer.get_product_id;
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

ALTER FUNCTION public.calculate_offer_discount(uuid,uuid,numeric) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.calculate_offer_discount(uuid,uuid,numeric) TO authenticated,service_role;


-- Keep notification text synchronized with the authoritative order total.
-- This covers POS, QR, website, takeaway, room, table and delivery orders.
CREATE OR REPLACE FUNCTION public.create_order_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_source text;
  v_total text;
  v_message text;
BEGIN
  v_source := COALESCE(
    NULLIF(TRIM(NEW.source_label),''),
    INITCAP(REPLACE(COALESCE(NEW.source_type,'order'),'_',' ')),
    'New order'
  );

  v_total := '₹' || TO_CHAR(COALESCE(NEW.total_amount,0),'FM999,999,999,990.00');
  v_message := FORMAT('%s • Order #%s • %s',v_source,LEFT(NEW.id::text,8),v_total);

  UPDATE public.notifications
  SET message=v_message,title='New order received',action_url='/kitchen'
  WHERE restaurant_id=NEW.restaurant_id
    AND type IN ('order','success')
    AND message LIKE FORMAT('%%%s%%',LEFT(NEW.id::text,8));

  IF NOT FOUND THEN
    INSERT INTO public.notifications(restaurant_id,user_id,type,title,message,action_url)
    VALUES(NEW.restaurant_id,NULL,'order','New order received',v_message,'/kitchen');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_new_order ON public.orders;

CREATE TRIGGER trg_notify_new_order
AFTER INSERT OR UPDATE OF total_amount ON public.orders
FOR EACH ROW
WHEN (NEW.restaurant_id IS NOT NULL)
EXECUTE FUNCTION public.create_order_notification();

-- Make sure the authenticated restaurant can actually receive notification
-- rows through Realtime. Contents remain scoped to its own restaurant.
DROP POLICY IF EXISTS notifications_realtime_select ON public.notifications;
CREATE POLICY notifications_realtime_select
ON public.notifications
FOR SELECT TO authenticated
USING (
  restaurant_id = public.current_restaurant_id()
  OR public.is_super_admin()
);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- Force the restaurant POS business clock to India Standard Time.
-- PostgreSQL timestamptz values remain absolute instants; this changes the
-- session/database timezone so now(), CURRENT_DATE, date_trunc(), etc. use IST.
ALTER DATABASE postgres SET timezone TO 'Asia/Kolkata';

-- Keep the documented application timezone explicit for the SQL runtime.
CREATE OR REPLACE FUNCTION public.app_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

CREATE OR REPLACE FUNCTION public.app_now()
RETURNS timestamp
LANGUAGE sql
STABLE
AS $$
  SELECT now() AT TIME ZONE 'Asia/Kolkata';
$$;

COMMENT ON FUNCTION public.app_today() IS 'Restaurant business date in Asia/Kolkata.';
COMMENT ON FUNCTION public.app_now() IS 'Restaurant local wall-clock timestamp in Asia/Kolkata.';
