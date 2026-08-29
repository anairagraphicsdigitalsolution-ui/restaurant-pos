BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced'
    CHECK (sync_status IN ('synced','pending','syncing','error')),
  ADD COLUMN IF NOT EXISTS offline_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS kot_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS offline_bill_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offline_bill_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS offline_payment_id uuid;

CREATE INDEX IF NOT EXISTS idx_orders_sync_status
  ON public.orders(restaurant_id, sync_status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_cloud_received
  ON public.orders(restaurant_id, cloud_received_at);

CREATE OR REPLACE FUNCTION public.finalize_synced_order_numbers(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_invoice_seq bigint;
  v_invoice_no text;
  v_kot_no integer;
  v_received_at timestamptz := clock_timestamp();
  v_kot public.kot_tickets%ROWTYPE;
  v_was_pending boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  v_was_pending := COALESCE(v_order.sync_status,'synced') = 'pending'
    AND (v_order.invoice_no IS NULL OR upper(trim(v_order.invoice_no)) IN ('PENDING','SYNCING','LOCAL'));

  IF NOT v_was_pending THEN
    RETURN jsonb_build_object('order_id',p_order_id,'invoice_no',v_order.invoice_no,'kot_no',NULL,'skipped',true);
  END IF;

  UPDATE public.orders SET cloud_received_at=COALESCE(cloud_received_at,v_received_at), sync_status='syncing', updated_at=v_received_at WHERE id=p_order_id;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;

  INSERT INTO public.invoice_sequences(restaurant_id,next_number) VALUES(v_order.restaurant_id,1) ON CONFLICT(restaurant_id) DO NOTHING;
  SELECT next_number INTO v_invoice_seq FROM public.invoice_sequences WHERE restaurant_id=v_order.restaurant_id FOR UPDATE;
  UPDATE public.invoice_sequences SET next_number=v_invoice_seq+1,updated_at=v_received_at WHERE restaurant_id=v_order.restaurant_id;
  v_invoice_no := 'INV-'||to_char(v_received_at AT TIME ZONE 'Asia/Kolkata','YYYY')||'-'||lpad(v_invoice_seq::text,6,'0');

  UPDATE public.orders SET invoice_no=v_invoice_no, invoice_generated_at=v_received_at
  WHERE id=p_order_id AND (invoice_no IS NULL OR upper(trim(invoice_no)) IN ('PENDING','SYNCING','LOCAL'));

  SELECT * INTO v_kot FROM public.kot_tickets WHERE order_id=p_order_id ORDER BY created_at ASC,id ASC LIMIT 1 FOR UPDATE;
  IF v_kot.id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('anaira-kot-'||v_order.restaurant_id::text));
    SELECT COALESCE(MAX(kot_no),0)+1 INTO v_kot_no FROM public.kot_tickets WHERE restaurant_id=v_order.restaurant_id;
    INSERT INTO public.kot_tickets(restaurant_id,order_id,kot_no,status,created_at)
    VALUES(v_order.restaurant_id,p_order_id,v_kot_no,
      CASE WHEN lower(coalesce(v_order.status,'')) IN ('cancelled','canceled','void','voided') THEN 'cancelled'
           WHEN lower(coalesce(v_order.status,'')) IN ('done','completed','complete') THEN 'ready'
           WHEN lower(coalesce(v_order.status,''))='preparing' THEN 'preparing' ELSE 'new' END,
      v_received_at) RETURNING * INTO v_kot;
    UPDATE public.orders SET kot_generated_at=v_received_at WHERE id=p_order_id;
  ELSE
    v_kot_no:=v_kot.kot_no;
  END IF;

  UPDATE public.orders SET sync_status='synced',updated_at=clock_timestamp() WHERE id=p_order_id;
  RETURN jsonb_build_object('order_id',p_order_id,'invoice_no',v_invoice_no,'kot_no',v_kot_no,
    'cloud_received_at',(SELECT cloud_received_at FROM public.orders WHERE id=p_order_id),
    'invoice_generated_at',(SELECT invoice_generated_at FROM public.orders WHERE id=p_order_id),
    'kot_generated_at',(SELECT kot_generated_at FROM public.orders WHERE id=p_order_id));
END;
$function$;

ALTER FUNCTION public.finalize_synced_order_numbers(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_synced_order_numbers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_synced_order_numbers(uuid) TO service_role, authenticated;

REVOKE ALL ON FUNCTION public.set_whatsapp_config(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_config(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_can_change_operational_settings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_can_change_operational_settings(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_save_restaurant_theme(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_restaurant_theme(uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_combo_feature_switch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_combo_feature_switch() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_closed_cash_closing_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prevent_closed_cash_closing_update() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reopen_cash_closing(uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_cash_closing(uuid,date,text) TO authenticated, service_role;

COMMIT;
