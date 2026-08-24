-- QR/website order WhatsApp flow.
-- Customer details are captured at order time and retained with the order.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text;

CREATE INDEX IF NOT EXISTS idx_orders_customer_phone
  ON public.orders(restaurant_id, customer_phone);

-- Optional per-restaurant WhatsApp order notification recipient.
-- The sender remains the restaurant's WhatsApp Business number.
