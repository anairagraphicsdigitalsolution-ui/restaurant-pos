-- QR waiter/bill requests -> restaurant notification center + Calling Device.
-- This is intentionally trigger-based so requests created by any API/runtime path are covered.
BEGIN;

CREATE OR REPLACE FUNCTION public.notify_qr_service_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  location_label text;
  request_title text;
  request_message text;
BEGIN
  IF NEW.call_type = 'bill_request' THEN
    request_title := 'Bill requested';
    request_message := 'Customer requested the bill';
  ELSE
    request_title := 'Waiter requested';
    request_message := 'Customer requested a waiter';
  END IF;

  IF NEW.table_id IS NOT NULL THEN
    SELECT format('Table %s', t.table_number) INTO location_label
    FROM public.tables t WHERE t.id = NEW.table_id;
  ELSIF NEW.room_id IS NOT NULL THEN
    SELECT format('Room %s', r.room_number) INTO location_label
    FROM public.rooms r WHERE r.id = NEW.room_id;
  END IF;

  request_message := request_message
    || COALESCE(' • ' || location_label, '')
    || COALESCE(' • Order #' || left(NEW.order_id::text, 8), '')
    || COALESCE(' • ' || NULLIF(NEW.note, ''), '');

  INSERT INTO public.notifications (
    restaurant_id, type, title, message, action_url
  ) VALUES (
    NEW.restaurant_id,
    'waiter_call',
    request_title,
    request_message,
    CASE WHEN NEW.call_type = 'bill_request'
      THEN '/billing' ELSE '/dashboard/calling' END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_qr_service_call ON public.restaurant_service_calls;
CREATE TRIGGER trg_notify_qr_service_call
AFTER INSERT ON public.restaurant_service_calls
FOR EACH ROW EXECUTE FUNCTION public.notify_qr_service_call();

REVOKE ALL ON FUNCTION public.notify_qr_service_call() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_qr_service_call() TO service_role;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_service_calls;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
