-- KOT + delivery-first kitchen workflow
-- Every order receives a persistent kitchen ticket. Delivery orders still pass through KDS first.

CREATE OR REPLACE FUNCTION public.ensure_kitchen_order_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.kitchen_order_tickets kot WHERE kot.order_id = NEW.id
  ) THEN
    INSERT INTO public.kitchen_order_tickets (
      restaurant_id, order_id, status, priority, notes
    ) VALUES (
      NEW.restaurant_id, NEW.id,
      CASE WHEN lower(coalesce(NEW.status,'')) = 'cancelled' THEN 'cancelled' ELSE 'new' END,
      CASE WHEN lower(coalesce(NEW.priority,'')) IN ('high','urgent') THEN lower(NEW.priority) ELSE 'normal' END,
      NULLIF(left(coalesce(NEW.overall_note,''),1000),'')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_kitchen_order_ticket ON public.orders;
CREATE TRIGGER trg_ensure_kitchen_order_ticket
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.ensure_kitchen_order_ticket();

CREATE OR REPLACE FUNCTION public.sync_kitchen_ticket_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.kitchen_order_tickets
  SET
    status = CASE
      WHEN lower(NEW.status) = 'preparing' THEN 'preparing'
      WHEN lower(NEW.status) IN ('done','completed','complete') THEN 'ready'
      WHEN lower(NEW.status) IN ('cancelled','canceled','void','voided') THEN 'cancelled'
      ELSE 'new'
    END,
    accepted_at = CASE WHEN lower(NEW.status) = 'preparing' AND accepted_at IS NULL THEN now() ELSE accepted_at END,
    preparing_at = CASE WHEN lower(NEW.status) = 'preparing' AND preparing_at IS NULL THEN now() ELSE preparing_at END,
    ready_at = CASE WHEN lower(NEW.status) IN ('done','completed','complete') AND ready_at IS NULL THEN now() ELSE ready_at END,
    bumped_at = CASE WHEN lower(NEW.status) IN ('cancelled','canceled','void','voided') THEN now() ELSE bumped_at END
  WHERE order_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_kitchen_ticket_status ON public.orders;
CREATE TRIGGER trg_sync_kitchen_ticket_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_kitchen_ticket_status();

-- Backfill a ticket for existing orders that do not have one yet.
INSERT INTO public.kitchen_order_tickets (restaurant_id, order_id, status, priority, notes)
SELECT
  o.restaurant_id,
  o.id,
  CASE
    WHEN lower(coalesce(o.status,'')) IN ('done','completed','complete') THEN 'ready'
    WHEN lower(coalesce(o.status,'')) IN ('cancelled','canceled','void','voided') THEN 'cancelled'
    WHEN lower(coalesce(o.status,'')) = 'preparing' THEN 'preparing'
    ELSE 'new'
  END,
  CASE WHEN lower(coalesce(o.priority,'')) IN ('high','urgent') THEN lower(o.priority) ELSE 'normal' END,
  NULLIF(left(coalesce(o.overall_note,''),1000),'')
FROM public.orders o
WHERE NOT EXISTS (
  SELECT 1 FROM public.kitchen_order_tickets kot WHERE kot.order_id = o.id
);

CREATE INDEX IF NOT EXISTS idx_kitchen_order_tickets_restaurant_order
  ON public.kitchen_order_tickets(restaurant_id, order_id);
