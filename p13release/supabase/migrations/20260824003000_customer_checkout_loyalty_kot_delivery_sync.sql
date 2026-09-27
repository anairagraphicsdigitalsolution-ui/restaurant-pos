BEGIN;

-- Automatic KOT records for every order.
-- The existing Operations Hub uses kot_tickets, so keep that table as the
-- operational source while the newer kitchen_order_tickets remains available.
CREATE OR REPLACE FUNCTION public.ensure_legacy_kot_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kot_no integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.kot_tickets WHERE order_id = NEW.id
  ) THEN
    SELECT COALESCE(MAX(kot_no), 0) + 1
      INTO v_kot_no
    FROM public.kot_tickets
    WHERE restaurant_id = NEW.restaurant_id;

    INSERT INTO public.kot_tickets(
      restaurant_id, order_id, kot_no, status
    )
    VALUES(
      NEW.restaurant_id,
      NEW.id,
      v_kot_no,
      CASE
        WHEN lower(coalesce(NEW.status,'')) IN ('cancelled','canceled','void','voided')
          THEN 'cancelled'
        WHEN lower(coalesce(NEW.status,'')) = 'preparing'
          THEN 'preparing'
        WHEN lower(coalesce(NEW.status,'')) IN ('done','completed','complete')
          THEN 'ready'
        ELSE 'new'
      END
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_legacy_kot_ticket ON public.orders;
CREATE TRIGGER trg_ensure_legacy_kot_ticket
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.ensure_legacy_kot_ticket();

-- Keep Operations Hub KOT status synchronized with the order lifecycle.
CREATE OR REPLACE FUNCTION public.sync_legacy_kot_ticket_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.kot_tickets
  SET status = CASE
    WHEN lower(coalesce(NEW.status,'')) = 'preparing' THEN 'preparing'
    WHEN lower(coalesce(NEW.status,'')) IN ('done','completed','complete') THEN 'ready'
    WHEN lower(coalesce(NEW.status,'')) IN ('cancelled','canceled','void','voided') THEN 'cancelled'
    ELSE status
  END
  WHERE order_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_legacy_kot_ticket_status ON public.orders;
CREATE TRIGGER trg_sync_legacy_kot_ticket_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_legacy_kot_ticket_status();

-- Backfill existing orders so Operations Hub can show historical KOTs too.
INSERT INTO public.kot_tickets(restaurant_id, order_id, kot_no, status)
SELECT
  o.restaurant_id,
  o.id,
  ROW_NUMBER() OVER (
    PARTITION BY o.restaurant_id
    ORDER BY o.created_at, o.id
  )::integer,
  CASE
    WHEN lower(coalesce(o.status,'')) IN ('done','completed','complete') THEN 'ready'
    WHEN lower(coalesce(o.status,'')) IN ('cancelled','canceled','void','voided') THEN 'cancelled'
    WHEN lower(coalesce(o.status,'')) = 'preparing' THEN 'preparing'
    ELSE 'new'
  END
FROM public.orders o
WHERE NOT EXISTS (
  SELECT 1 FROM public.kot_tickets k WHERE k.order_id = o.id
);

-- Loyalty must be controlled by the actual Loyalty plugin.
-- Turning the plugin off stops future points automatically.
CREATE OR REPLACE FUNCTION public.award_loyalty_for_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.loyalty_settings%rowtype;
  c public.customers%rowtype;
  base_points integer;
  final_points integer;
  multiplier numeric := 1;
  tier_record record;
  v_loyalty_enabled boolean;
BEGIN
  IF new.customer_id IS NULL THEN RETURN new; END IF;
  IF lower(coalesce(new.status,'')) IN ('cancelled','canceled') THEN RETURN new; END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.restaurant_plugins rp
    WHERE rp.restaurant_id = new.restaurant_id
      AND rp.plugin_code = 'loyalty'
      AND rp.enabled = true
  ) INTO v_loyalty_enabled;

  IF NOT v_loyalty_enabled THEN RETURN new; END IF;

  IF NOT (
    lower(coalesce(new.payment_status,'')) = 'paid'
    OR lower(coalesce(new.status,'')) IN ('paid','completed','done','served')
  ) THEN
    RETURN new;
  END IF;

  PERFORM public.seed_default_loyalty_config(new.restaurant_id);

  SELECT * INTO s
  FROM public.loyalty_settings
  WHERE restaurant_id = new.restaurant_id;

  IF NOT coalesce(s.enabled,true) THEN RETURN new; END IF;
  IF coalesce(new.total_amount,0) < coalesce(s.min_bill_amount,0) THEN RETURN new; END IF;

  IF EXISTS(
    SELECT 1
    FROM public.loyalty_transactions
    WHERE order_id = new.id
      AND transaction_type = 'earn'
  ) THEN
    RETURN new;
  END IF;

  SELECT * INTO c
  FROM public.customers
  WHERE id = new.customer_id
    AND restaurant_id = new.restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN new; END IF;

  base_points := floor(
    greatest(coalesce(new.total_amount,0),0)
    * coalesce(s.points_per_rupee,0)
  )::integer;

  SELECT multiplier INTO tier_record
  FROM public.loyalty_tiers
  WHERE restaurant_id = new.restaurant_id
    AND active = true
    AND min_points <= coalesce(c.loyalty_points,0)
  ORDER BY min_points DESC
  LIMIT 1;

  multiplier := coalesce(tier_record.multiplier,1);
  final_points := floor(base_points * multiplier)::integer;

  IF s.max_points_per_order IS NOT NULL THEN
    final_points := least(final_points, s.max_points_per_order);
  END IF;

  IF final_points <= 0 THEN RETURN new; END IF;

  UPDATE public.customers
  SET loyalty_points = loyalty_points + final_points,
      total_orders = total_orders + 1,
      total_spend = total_spend + coalesce(new.total_amount,0),
      last_visit_at = coalesce(new.created_at, now()),
      updated_at = now()
  WHERE id = c.id;

  INSERT INTO public.loyalty_transactions(
    restaurant_id, customer_id, order_id, points, transaction_type, note
  )
  VALUES(
    new.restaurant_id,
    new.customer_id,
    new.id,
    final_points,
    'earn',
    'Automatic order reward'
  );

  RETURN new;
END;
$$;

-- Delivery should follow the bill/customer lifecycle for delivery orders.
CREATE OR REPLACE FUNCTION public.sync_delivery_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.order_mode,'')) = 'delivery' THEN
    IF lower(coalesce(NEW.status,'')) IN ('completed','done','delivered','served') THEN
      UPDATE public.restaurant_deliveries
      SET status = 'delivered'
      WHERE order_id = NEW.id
        AND restaurant_id = NEW.restaurant_id
        AND status <> 'cancelled';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_delivery_from_order ON public.orders;
CREATE TRIGGER trg_sync_delivery_from_order
AFTER UPDATE OF status, order_mode ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_delivery_from_order();

COMMIT;
