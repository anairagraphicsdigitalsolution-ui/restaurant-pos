BEGIN;
ALTER TABLE public.restaurant_service_calls ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_restaurant_service_calls_restaurant_order_open ON public.restaurant_service_calls(restaurant_id,order_id,status,created_at DESC) WHERE order_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_qr_service_notification ON public.restaurant_service_calls;
NOTIFY pgrst, 'reload schema';
COMMIT;
