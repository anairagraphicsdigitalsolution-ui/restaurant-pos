-- QR bill/payment UX, restaurant-scoped order numbers, and service-request alerts.
-- Data-preserving: no order/payment rows are deleted.
BEGIN;
ALTER TABLE public.restaurant_service_calls ADD COLUMN IF NOT EXISTS order_id uuid;
CREATE INDEX IF NOT EXISTS idx_restaurant_service_calls_order_open ON public.restaurant_service_calls (restaurant_id, order_id, status, created_at DESC) WHERE order_id IS NOT NULL;
-- The live project already contains the corresponding idempotent functions/triggers.
-- Bill requests open the authenticated billing screen; waiter calls open calling.
NOTIFY pgrst, 'reload schema';
COMMIT;
