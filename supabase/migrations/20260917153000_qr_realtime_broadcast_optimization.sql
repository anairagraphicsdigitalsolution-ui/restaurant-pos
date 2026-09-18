BEGIN;

-- QR customers are public/guest clients, so do not expose the orders table
-- directly to Realtime Postgres Changes. Instead, broadcast only a minimal
-- wake-up payload to the topic derived from the already-secret QR session
-- token hash. The client then revalidates through the existing server API.
CREATE OR REPLACE FUNCTION public.broadcast_qr_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_token_hash text;
  v_status text;
  v_payment_status text;
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.id, OLD.id);
  v_token_hash := NULL;

  IF COALESCE(NEW.qr_session_id, OLD.qr_session_id) IS NOT NULL THEN
    SELECT s.token_hash
      INTO v_token_hash
      FROM public.qr_guest_sessions s
     WHERE s.id = COALESCE(NEW.qr_session_id, OLD.qr_session_id)
     LIMIT 1;
  END IF;

  IF v_token_hash IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_status := lower(COALESCE(NEW.status, OLD.status, 'pending'));
  v_payment_status := lower(COALESCE(NEW.payment_status, OLD.payment_status, 'unpaid'));

  PERFORM realtime.send(
    jsonb_build_object(
      'order_id', v_order_id,
      'status', v_status,
      'payment_status', v_payment_status,
      'updated_at', COALESCE(NEW.updated_at, OLD.updated_at, now())
    ),
    'order_update',
    'qr-track:' || v_token_hash,
    false
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Realtime must never break an order transaction. The existing HTTP
  -- fallback polling remains the correctness path if Broadcast is unavailable.
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_broadcast_qr_order_update ON public.orders;
CREATE TRIGGER trg_broadcast_qr_order_update
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
  OR OLD.paid_amount IS DISTINCT FROM NEW.paid_amount
  OR OLD.invoice_no IS DISTINCT FROM NEW.invoice_no
  OR OLD.updated_at IS DISTINCT FROM NEW.updated_at
)
EXECUTE FUNCTION public.broadcast_qr_order_update();

NOTIFY pgrst, 'reload schema';
COMMIT;
