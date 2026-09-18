-- Anaira Fast Order Engine: additive performance + retry safety.
-- No existing columns/features are removed.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_restaurant_client_request
  ON public.orders (restaurant_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_source_open
  ON public.orders (restaurant_id, source_type, source_id, created_at DESC)
  WHERE payment_status IS DISTINCT FROM 'paid';

CREATE INDEX IF NOT EXISTS idx_orders_kitchen_active
  ON public.orders (restaurant_id, created_at DESC)
  WHERE lower(coalesce(status, 'pending')) NOT IN
    ('done','completed','complete','cancelled','canceled','void','voided','refunded');

CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_restaurant_status_created
  ON public.kitchen_order_tickets (restaurant_id, status, created_at DESC);
