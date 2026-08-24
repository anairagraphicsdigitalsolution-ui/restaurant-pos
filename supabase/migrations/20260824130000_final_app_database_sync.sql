BEGIN;

-- ============================================================
-- ANAIRA FINAL PRODUCTION REPAIR / APP-DATABASE SYNC
-- ============================================================
-- Safe to re-run. This migration brings the critical billing,
-- payment-ledger and loyalty paths to one authoritative version.

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id uuid;

-- Keep the authoritative payment-ledger reconciliation in sync.
CREATE OR REPLACE FUNCTION public.sync_order_payment_totals(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_status text := 'unpaid';
  v_method text;
BEGIN
  SELECT COALESCE(total_amount,0) INTO v_total FROM public.orders WHERE id=p_order_id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.order_payments WHERE order_id=p_order_id AND status='paid';
  SELECT v_paid - COALESCE((SELECT SUM(amount) FROM public.order_refunds WHERE order_id=p_order_id AND status='refunded'),0) INTO v_paid;
  v_paid := GREATEST(LEAST(v_paid,v_total),0);

  SELECT payment_method INTO v_method
  FROM public.order_payments
  WHERE order_id=p_order_id AND status='paid'
  ORDER BY paid_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_total > 0 AND v_paid >= v_total THEN v_status := 'paid';
  ELSIF v_paid > 0 THEN v_status := 'partially_paid';
  END IF;

  UPDATE public.orders
  SET paid_amount=v_paid, payment_status=v_status, payment_method=COALESCE(v_method,payment_method)
  WHERE id=p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_order_payment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_order_payment_totals(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM public.sync_order_payment_totals(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_payments_sync_totals ON public.order_payments;
CREATE TRIGGER trg_order_payments_sync_totals
AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_order_payment_totals();

DROP TRIGGER IF EXISTS trg_order_refunds_sync_totals ON public.order_refunds;
CREATE TRIGGER trg_order_refunds_sync_totals
AFTER INSERT OR UPDATE OR DELETE ON public.order_refunds
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_order_payment_totals();


CREATE OR REPLACE FUNCTION public.award_loyalty_for_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.loyalty_settings%ROWTYPE;
  c public.customers%ROWTYPE;
  base_points integer := 0;
  final_points integer := 0;
  v_multiplier numeric := 1;
  tier_record record;
  plugin_on boolean := false;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF lower(coalesce(NEW.status,'')) IN ('cancelled','canceled') THEN
    RETURN NEW;
  END IF;

  IF NOT (
    lower(coalesce(NEW.payment_status,'')) = 'paid'
    OR lower(coalesce(NEW.status,'')) IN ('paid','completed','done','served')
  ) THEN
    RETURN NEW;
  END IF;

  -- Respect the restaurant loyalty/CRM plugin control when present.
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_plugins rp
    WHERE rp.restaurant_id = NEW.restaurant_id
      AND rp.plugin_code IN ('loyalty','crm')
      AND rp.enabled = true
  )
  INTO plugin_on;

  -- Older installations may not have a loyalty plugin row. In that case,
  -- loyalty_settings remains the source of truth.
  IF NOT plugin_on AND EXISTS (
    SELECT 1 FROM public.restaurant_plugins
    WHERE restaurant_id = NEW.restaurant_id
      AND plugin_code IN ('loyalty','crm')
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.seed_default_loyalty_config(NEW.restaurant_id);

  SELECT *
  INTO s
  FROM public.loyalty_settings
  WHERE restaurant_id = NEW.restaurant_id;

  IF NOT coalesce(s.enabled,true) THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.total_amount,0) < coalesce(s.min_bill_amount,0) THEN
    RETURN NEW;
  END IF;

  -- Idempotency: never award the same order twice.
  IF EXISTS (
    SELECT 1
    FROM public.loyalty_transactions
    WHERE order_id = NEW.id
      AND transaction_type = 'earn'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO c
  FROM public.customers
  WHERE id = NEW.customer_id
    AND restaurant_id = NEW.restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  base_points := floor(
    greatest(coalesce(NEW.total_amount,0),0)
    * coalesce(s.points_per_rupee,0)
  )::integer;

  -- FIX: explicitly qualify the multiplier column and use a separate
  -- variable name so PL/pgSQL cannot confuse it with the column.
  SELECT lt.multiplier
  INTO tier_record
  FROM public.loyalty_tiers AS lt
  WHERE lt.restaurant_id = NEW.restaurant_id
    AND lt.active = true
    AND lt.min_points <= coalesce(c.loyalty_points,0)
  ORDER BY lt.min_points DESC
  LIMIT 1;

  v_multiplier := coalesce(tier_record.multiplier,1);

  final_points := floor(base_points * v_multiplier)::integer;

  IF s.max_points_per_order IS NOT NULL THEN
    final_points := least(final_points, s.max_points_per_order);
  END IF;

  IF final_points <= 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.customers
  SET
    loyalty_points = coalesce(loyalty_points,0) + final_points,
    total_orders = coalesce(total_orders,0) + 1,
    total_spend = coalesce(total_spend,0) + coalesce(NEW.total_amount,0),
    last_visit_at = coalesce(NEW.created_at,now()),
    updated_at = now()
  WHERE id = c.id;

  INSERT INTO public.loyalty_transactions(
    restaurant_id,
    customer_id,
    order_id,
    points,
    transaction_type,
    note
  )
  VALUES(
    NEW.restaurant_id,
    NEW.customer_id,
    NEW.id,
    final_points,
    'earn',
    'Automatic order reward'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_loyalty_for_order ON public.orders;

CREATE TRIGGER trg_award_loyalty_for_order
AFTER INSERT OR UPDATE OF status,payment_status,total_amount,customer_id
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.award_loyalty_for_order();

REVOKE ALL ON FUNCTION public.award_loyalty_for_order() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_loyalty_for_order() TO authenticated, service_role;


-- Storage buckets used by the application. Existing buckets are preserved.
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-covers', 'restaurant-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

COMMIT;
