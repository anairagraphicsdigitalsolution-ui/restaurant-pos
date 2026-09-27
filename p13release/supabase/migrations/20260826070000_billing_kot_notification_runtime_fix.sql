-- Billing/KOT/notification runtime hardening.
-- Safe for existing data: no destructive changes.

-- ------------------------------------------------------------
-- 1) Authoritative payment reconciliation.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_order_payment_state(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid numeric(12,2) := 0;
  v_refunded numeric(12,2) := 0;
  v_net numeric(12,2) := 0;
  v_status text := 'unpaid';
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
  FROM public.order_payments
  WHERE order_id = p_order_id AND status = 'paid';

  SELECT COALESCE(SUM(amount),0) INTO v_refunded
  FROM public.order_refunds
  WHERE order_id = p_order_id AND COALESCE(status,'refunded') = 'refunded';

  v_net := GREATEST(v_paid - v_refunded, 0);
  IF COALESCE(v_order.total_amount,0) <= 0 AND v_net > 0 THEN
    v_status := 'paid';
  ELSIF v_net >= COALESCE(v_order.total_amount,0) AND COALESCE(v_order.total_amount,0) > 0 THEN
    v_status := 'paid';
  ELSIF v_net > 0 THEN
    v_status := 'partially_paid';
  ELSE
    v_status := 'unpaid';
  END IF;

  UPDATE public.orders
  SET paid_amount = v_net,
      payment_status = v_status,
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_order_payment_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_order_payment_state(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_order_payment_state_from_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reconcile_order_payment_state(CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_payment_state ON public.order_payments;
CREATE TRIGGER trg_sync_order_payment_state
AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_order_payment_state_from_ledger();

DROP TRIGGER IF EXISTS trg_sync_order_refund_payment_state ON public.order_refunds;
CREATE TRIGGER trg_sync_order_refund_payment_state
AFTER INSERT OR UPDATE OR DELETE ON public.order_refunds
FOR EACH ROW EXECUTE FUNCTION public.sync_order_payment_state_from_ledger();

-- Repair all existing orders from the actual payment ledger.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders LOOP
    PERFORM public.reconcile_order_payment_state(r.id);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2) Concurrency-safe KOT numbering per restaurant.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_legacy_kot_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kot_no integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.kot_tickets WHERE order_id = NEW.id) THEN
    -- Serialize only KOT-number allocation for this restaurant.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.restaurant_id::text, 0));
    SELECT COALESCE(MAX(kot_no),0) + 1 INTO v_kot_no
    FROM public.kot_tickets
    WHERE restaurant_id = NEW.restaurant_id;

    INSERT INTO public.kot_tickets(restaurant_id, order_id, kot_no, status)
    VALUES(NEW.restaurant_id, NEW.id, v_kot_no,
      CASE
        WHEN lower(coalesce(NEW.status,'')) IN ('cancelled','canceled','void','voided') THEN 'cancelled'
        WHEN lower(coalesce(NEW.status,'')) = 'preparing' THEN 'preparing'
        WHEN lower(coalesce(NEW.status,'')) IN ('done','completed','complete') THEN 'ready'
        ELSE 'new'
      END);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_legacy_kot_ticket ON public.orders;
CREATE TRIGGER trg_ensure_legacy_kot_ticket
AFTER INSERT ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.ensure_legacy_kot_ticket();

-- Ensure existing KOTs are serial and unique per restaurant.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY created_at, id)::integer AS new_no
  FROM public.kot_tickets
)
UPDATE public.kot_tickets k SET kot_no = r.new_no FROM ranked r WHERE r.id = k.id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_kot_tickets_restaurant_kot_no
  ON public.kot_tickets(restaurant_id, kot_no);
