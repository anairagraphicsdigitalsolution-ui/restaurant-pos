-- Anaira P0: market-parity reliability foundation.
-- Additive only. No business rows are deleted or rewritten.

CREATE TABLE IF NOT EXISTS public.p0_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  request_hash text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (restaurant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_p0_idempotency_operation ON public.p0_idempotency_keys(restaurant_id, operation, created_at DESC);

CREATE TABLE IF NOT EXISTS public.p0_sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  entity text NOT NULL,
  entity_id uuid,
  direction text NOT NULL CHECK (direction IN ('local_to_cloud','cloud_to_local')),
  resolution text NOT NULL DEFAULT 'manual' CHECK (resolution IN ('manual','local-newer','cloud-newer','server-wins','client-wins','merged')),
  local_data jsonb,
  incoming_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_p0_sync_conflicts_open ON public.p0_sync_conflicts(restaurant_id, resolved_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.p0_payment_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_reference text,
  expected_amount numeric(12,2) NOT NULL DEFAULT 0,
  received_amount numeric(12,2) NOT NULL DEFAULT 0,
  difference numeric(12,2) GENERATED ALWAYS AS (received_amount - expected_amount) STORED,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','partial','short','over','exception','settled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_at timestamptz,
  matched_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_p0_payment_reconciliation_order ON public.p0_payment_reconciliation(restaurant_id, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_p0_payment_reconciliation_status ON public.p0_payment_reconciliation(restaurant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.p0_accounting_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  account_code text NOT NULL,
  account_name text,
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  reference text,
  narration text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK ((debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0))
);
CREATE INDEX IF NOT EXISTS idx_p0_accounting_source ON public.p0_accounting_journal_entries(restaurant_id, source_type, source_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_p0_accounting_date ON public.p0_accounting_journal_entries(restaurant_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS public.p0_aggregator_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  external_order_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','ignored','failed')),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, provider, external_event_id)
);
CREATE INDEX IF NOT EXISTS idx_p0_aggregator_events_order ON public.p0_aggregator_events(restaurant_id, provider, external_order_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_p0_aggregator_events_status ON public.p0_aggregator_events(restaurant_id, status, received_at DESC);

ALTER TABLE public.p0_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p0_sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p0_payment_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p0_accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p0_aggregator_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p0_idempotency_staff ON public.p0_idempotency_keys;
CREATE POLICY p0_idempotency_staff ON public.p0_idempotency_keys FOR SELECT TO authenticated
USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS p0_sync_conflicts_staff ON public.p0_sync_conflicts;
CREATE POLICY p0_sync_conflicts_staff ON public.p0_sync_conflicts FOR SELECT TO authenticated
USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS p0_reconciliation_staff ON public.p0_payment_reconciliation;
CREATE POLICY p0_reconciliation_staff ON public.p0_payment_reconciliation FOR SELECT TO authenticated
USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS p0_accounting_staff ON public.p0_accounting_journal_entries;
CREATE POLICY p0_accounting_staff ON public.p0_accounting_journal_entries FOR SELECT TO authenticated
USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS p0_aggregator_staff ON public.p0_aggregator_events;
CREATE POLICY p0_aggregator_staff ON public.p0_aggregator_events FOR SELECT TO authenticated
USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id));

CREATE OR REPLACE FUNCTION public.p0_record_payment(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'cash',
  p_reference text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid numeric(12,2);
  v_refunded numeric(12,2);
  v_net numeric(12,2);
  v_remaining numeric(12,2);
  v_payment public.order_payments%ROWTYPE;
  v_key public.p0_idempotency_keys%ROWTYPE;
  v_hash text := md5(jsonb_build_object('order_id',p_order_id,'amount',round(p_amount,2),'method',p_payment_method,'reference',p_reference,'metadata',p_metadata)::text);
  v_response jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
  IF NOT (auth.role()='service_role' OR public.is_super_admin() OR public.is_restaurant_member(p_restaurant_id)) THEN RAISE EXCEPTION 'Restaurant access denied'; END IF;

  IF NULLIF(trim(p_idempotency_key),'') IS NOT NULL THEN
    INSERT INTO public.p0_idempotency_keys(restaurant_id,idempotency_key,operation,request_hash)
    VALUES(p_restaurant_id,trim(p_idempotency_key),'payment',v_hash)
    ON CONFLICT (restaurant_id,idempotency_key) DO NOTHING;
    SELECT * INTO v_key FROM public.p0_idempotency_keys WHERE restaurant_id=p_restaurant_id AND idempotency_key=trim(p_idempotency_key) FOR UPDATE;
    IF v_key.request_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'Idempotency key was already used for a different payment'; END IF;
    IF v_key.status='completed' AND v_key.response IS NOT NULL THEN RETURN v_key.response || jsonb_build_object('duplicate',true); END IF;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND restaurant_id=p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF lower(coalesce(v_order.status,'')) IN ('cancelled','canceled','void','voided') THEN RAISE EXCEPTION 'Cancelled/voided order cannot receive payment'; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.order_payments WHERE order_id=p_order_id AND status='paid';
  SELECT COALESCE(SUM(amount),0) INTO v_refunded FROM public.order_refunds WHERE order_id=p_order_id AND status='refunded';
  v_net := GREATEST(v_paid-v_refunded,0);
  v_remaining := GREATEST(COALESCE(v_order.total_amount,0)-v_net,0);
  IF p_amount > v_remaining + 0.005 THEN RAISE EXCEPTION 'Payment exceeds remaining balance (remaining ₹%)', to_char(v_remaining,'FM999999990.00'); END IF;

  INSERT INTO public.order_payments(restaurant_id,order_id,payment_method,amount,reference,status,paid_at,created_by,notes)
  VALUES(p_restaurant_id,p_order_id,lower(coalesce(p_payment_method,'cash')),round(p_amount,2),coalesce(nullif(trim(p_reference),''),CASE WHEN p_idempotency_key IS NOT NULL THEN 'idempotency:'||trim(p_idempotency_key) ELSE NULL END),'paid',now(),coalesce(p_actor_id,auth.uid()),'P0 transaction-safe payment')
  RETURNING * INTO v_payment;

  PERFORM public.sync_order_payment_totals(p_order_id);

  v_response := jsonb_build_object('success',true,'payment',to_jsonb(v_payment),'order_id',p_order_id,'amount',round(p_amount,2),'net_paid',round(LEAST(v_net+p_amount,coalesce(v_order.total_amount, v_net+p_amount)),2));
  IF NULLIF(trim(p_idempotency_key),'') IS NOT NULL THEN
    UPDATE public.p0_idempotency_keys SET status='completed',response=v_response,completed_at=now() WHERE id=v_key.id;
  END IF;
  RETURN v_response;
END; $$;

CREATE OR REPLACE FUNCTION public.p0_record_refund(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_reason text DEFAULT 'Customer refund',
  p_payment_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid numeric(12,2);
  v_refunded numeric(12,2);
  v_net numeric(12,2);
  v_refund public.order_refunds%ROWTYPE;
  v_key public.p0_idempotency_keys%ROWTYPE;
  v_hash text := md5(jsonb_build_object('order_id',p_order_id,'amount',round(p_amount,2),'reason',p_reason,'payment_id',p_payment_id,'metadata',p_metadata)::text);
  v_response jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Refund amount must be positive'; END IF;
  IF NOT (auth.role()='service_role' OR public.is_super_admin() OR public.is_restaurant_member(p_restaurant_id)) THEN RAISE EXCEPTION 'Restaurant access denied'; END IF;
  IF NULLIF(trim(p_idempotency_key),'') IS NOT NULL THEN
    INSERT INTO public.p0_idempotency_keys(restaurant_id,idempotency_key,operation,request_hash)
    VALUES(p_restaurant_id,trim(p_idempotency_key),'refund',v_hash)
    ON CONFLICT (restaurant_id,idempotency_key) DO NOTHING;
    SELECT * INTO v_key FROM public.p0_idempotency_keys WHERE restaurant_id=p_restaurant_id AND idempotency_key=trim(p_idempotency_key) FOR UPDATE;
    IF v_key.request_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'Idempotency key was already used for a different refund'; END IF;
    IF v_key.status='completed' AND v_key.response IS NOT NULL THEN RETURN v_key.response || jsonb_build_object('duplicate',true); END IF;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND restaurant_id=p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.order_payments WHERE order_id=p_order_id AND status='paid';
  SELECT COALESCE(SUM(amount),0) INTO v_refunded FROM public.order_refunds WHERE order_id=p_order_id AND status='refunded';
  v_net := GREATEST(v_paid-v_refunded,0);
  IF p_amount > v_net + 0.005 THEN RAISE EXCEPTION 'Refund exceeds refundable net payment (available ₹%)', to_char(v_net,'FM999999990.00'); END IF;

  INSERT INTO public.order_refunds(restaurant_id,order_id,payment_id,amount,status,reason,created_by)
  VALUES(p_restaurant_id,p_order_id,p_payment_id,round(p_amount,2),'refunded',coalesce(nullif(trim(p_reason),''),'Customer refund'),coalesce(p_actor_id,auth.uid()))
  RETURNING * INTO v_refund;
  PERFORM public.sync_order_payment_totals(p_order_id);
  v_response := jsonb_build_object('success',true,'refund',to_jsonb(v_refund),'order_id',p_order_id,'amount',round(p_amount,2),'net_after_refund',round(v_net-p_amount,2));
  IF NULLIF(trim(p_idempotency_key),'') IS NOT NULL THEN
    UPDATE public.p0_idempotency_keys SET status='completed',response=v_response,completed_at=now() WHERE id=v_key.id;
  END IF;
  RETURN v_response;
END; $$;

CREATE OR REPLACE FUNCTION public.p0_void_order(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_reason text DEFAULT 'Voided by staff',
  p_idempotency_key text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid numeric(12,2);
  v_refunded numeric(12,2);
  v_key public.p0_idempotency_keys%ROWTYPE;
  v_hash text := md5(jsonb_build_object('order_id',p_order_id,'reason',p_reason)::text);
  v_response jsonb;
BEGIN
  IF NOT (auth.role()='service_role' OR public.is_super_admin() OR public.is_restaurant_member(p_restaurant_id)) THEN RAISE EXCEPTION 'Restaurant access denied'; END IF;
  IF NULLIF(trim(p_idempotency_key),'') IS NOT NULL THEN
    INSERT INTO public.p0_idempotency_keys(restaurant_id,idempotency_key,operation,request_hash)
    VALUES(p_restaurant_id,trim(p_idempotency_key),'void',v_hash)
    ON CONFLICT (restaurant_id,idempotency_key) DO NOTHING;
    SELECT * INTO v_key FROM public.p0_idempotency_keys WHERE restaurant_id=p_restaurant_id AND idempotency_key=trim(p_idempotency_key) FOR UPDATE;
    IF v_key.request_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'Idempotency key was already used for a different void'; END IF;
    IF v_key.status='completed' AND v_key.response IS NOT NULL THEN RETURN v_key.response || jsonb_build_object('duplicate',true); END IF;
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND restaurant_id=p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.order_payments WHERE order_id=p_order_id AND status='paid';
  SELECT COALESCE(SUM(amount),0) INTO v_refunded FROM public.order_refunds WHERE order_id=p_order_id AND status='refunded';
  IF GREATEST(v_paid-v_refunded,0) > 0.005 THEN RAISE EXCEPTION 'Paid or partially paid orders cannot be voided'; END IF;
  UPDATE public.orders SET status='cancelled',void_reason=coalesce(nullif(trim(p_reason),''),'Voided by staff'),cancelled_at=now(),updated_at=now() WHERE id=p_order_id AND restaurant_id=p_restaurant_id RETURNING * INTO v_order;
  INSERT INTO public.pos_audit_events(restaurant_id,actor_id,action,entity_type,entity_id,after_data,reason)
  VALUES(p_restaurant_id,coalesce(p_actor_id,auth.uid()),'order.voided','order',p_order_id,jsonb_build_object('status',v_order.status),p_reason);
  v_response := jsonb_build_object('success',true,'order',to_jsonb(v_order));
  IF NULLIF(trim(p_idempotency_key),'') IS NOT NULL THEN UPDATE public.p0_idempotency_keys SET status='completed',response=v_response,completed_at=now() WHERE id=v_key.id; END IF;
  RETURN v_response;
END; $$;

REVOKE ALL ON FUNCTION public.p0_record_payment(uuid,uuid,numeric,text,text,text,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.p0_record_refund(uuid,uuid,numeric,text,uuid,text,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.p0_void_order(uuid,uuid,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.p0_record_payment(uuid,uuid,numeric,text,text,text,uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p0_record_refund(uuid,uuid,numeric,text,uuid,text,uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p0_void_order(uuid,uuid,text,text,uuid) TO authenticated, service_role;

COMMENT ON TABLE public.p0_idempotency_keys IS 'Anaira P0 exactly-once request guard for financial and sync operations.';
COMMENT ON TABLE public.p0_sync_conflicts IS 'Anaira P0 explicit local/cloud conflict queue; no silent overwrite.';
COMMENT ON TABLE public.p0_payment_reconciliation IS 'Anaira P0 payment settlement/reconciliation workspace.';
COMMENT ON TABLE public.p0_accounting_journal_entries IS 'Anaira P0 accounting adapter journal staging ledger.';
COMMENT ON TABLE public.p0_aggregator_events IS 'Anaira P0 provider webhook/event deduplication ledger.';
