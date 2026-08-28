-- Billing workflow hardening
-- An order must be explicitly marked DONE before Billing can finalize it.
-- This is defense-in-depth for direct/database-side writes; the application
-- also enforces the same rule in the Billing page and finalize API.

CREATE OR REPLACE FUNCTION public.prevent_billing_before_order_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.status, '')) <> 'done'
     AND (
       (NEW.payment_status IS DISTINCT FROM OLD.payment_status
        AND lower(coalesce(NEW.payment_status, '')) IN ('paid', 'partially_paid'))
       OR NEW.billed_at IS DISTINCT FROM OLD.billed_at
       OR NEW.invoice_no IS DISTINCT FROM OLD.invoice_no
     ) THEN
    RAISE EXCEPTION 'Order must be marked Done before billing';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_require_done_before_billing ON public.orders;

CREATE TRIGGER trg_orders_require_done_before_billing
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_billing_before_order_done();
