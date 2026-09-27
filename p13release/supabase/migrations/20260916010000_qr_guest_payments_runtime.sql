BEGIN;

-- Guest QR session and payment runtime. Additive only.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qr_session_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qr_client_request_id text;

CREATE TABLE IF NOT EXISTS public.qr_guest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('table','room')),
  source_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS public.qr_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.qr_guest_sessions(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  method text NOT NULL DEFAULT 'manual_qr' CHECK (method IN ('manual_qr','cashfree')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','customer_claimed','processing','paid','failed','expired','cancelled')),
  provider text,
  provider_order_id text,
  payment_session_id text,
  reference text,
  customer_claimed_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_guest_sessions_source ON public.qr_guest_sessions(restaurant_id,source_type,source_id,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_qr_session ON public.orders(qr_session_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_qr_client_request ON public.orders(restaurant_id,qr_client_request_id) WHERE qr_client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qr_payment_requests_order ON public.qr_payment_requests(order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_payment_requests_restaurant ON public.qr_payment_requests(restaurant_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_payment_provider_order ON public.qr_payment_requests(provider,provider_order_id) WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL;

ALTER TABLE public.qr_guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_payment_requests ENABLE ROW LEVEL SECURITY;

-- Public QR APIs use service_role. No anonymous access is granted to these tables.
DROP POLICY IF EXISTS qr_guest_sessions_member ON public.qr_guest_sessions;
DROP POLICY IF EXISTS qr_payment_requests_member ON public.qr_payment_requests;
CREATE POLICY qr_guest_sessions_member ON public.qr_guest_sessions FOR ALL TO authenticated USING (public.is_restaurant_member(restaurant_id)) WITH CHECK (public.is_restaurant_member(restaurant_id));
CREATE POLICY qr_payment_requests_member ON public.qr_payment_requests FOR ALL TO authenticated USING (public.is_restaurant_member(restaurant_id)) WITH CHECK (public.is_restaurant_member(restaurant_id));

-- A successful provider payment can finish the invoice without a human click when
-- the restaurant has explicitly enabled automatic payment confirmation. The function
-- deliberately chooses a real admin actor from the same restaurant so existing
-- billing audit/RLS semantics remain intact.
CREATE OR REPLACE FUNCTION public.auto_finalize_paid_qr_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_actor uuid;
  v_result jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF lower(COALESCE(v_order.payment_status,'unpaid')) <> 'paid' THEN
    RETURN jsonb_build_object('success',false,'reason','payment_not_fully_paid','order_id',v_order.id);
  END IF;

  IF NULLIF(trim(COALESCE(v_order.invoice_no,'')),'') IS NOT NULL
     AND trim(COALESCE(v_order.invoice_no,'')) <> 'PENDING' THEN
    RETURN jsonb_build_object('success',true,'already_finalized',true,'order_id',v_order.id,'invoice_no',v_order.invoice_no);
  END IF;

  SELECT p.id INTO v_actor
  FROM public.profiles p
  WHERE p.restaurant_id=v_order.restaurant_id
    AND p.role='admin'
  ORDER BY p.id
  LIMIT 1;

  IF v_actor IS NULL THEN
    SELECT p.id INTO v_actor
    FROM public.profiles p
    WHERE p.restaurant_id=v_order.restaurant_id
      AND p.role='staff'
    ORDER BY p.id
    LIMIT 1;
  END IF;

  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success',false,'reason','no_billable_actor','order_id',v_order.id);
  END IF;

  SELECT public.stage3_finalize_order(
    v_actor,
    v_order.id,
    'online',
    0,
    v_order.offer_id,
    NULL,
    0,
    'amount'
  ) INTO v_result;

  RETURN COALESCE(v_result,'{}'::jsonb) || jsonb_build_object('success',true,'auto_finalized',true);
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_finalize_paid_qr_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_finalize_paid_qr_order(uuid) TO service_role;

COMMIT;

BEGIN;
CREATE OR REPLACE FUNCTION public.record_order_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
BEGIN
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(restaurant_id,order_id,status,source,note,changed_by)
    VALUES(NEW.restaurant_id,NEW.id,COALESCE(NEW.status,'pending'),COALESCE(NEW.source_type,'pos'),'Order status update',NULL);
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_record_order_status_history ON public.orders;
CREATE TRIGGER trg_record_order_status_history
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.record_order_status_history();
REVOKE ALL ON FUNCTION public.record_order_status_history() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_status_history() TO service_role;
COMMIT;
