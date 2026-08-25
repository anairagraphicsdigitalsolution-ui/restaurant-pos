BEGIN;

-- Final POS hardening: explicit billing idempotency keys.
-- Existing finalize RPC already locks the order row and is idempotent for paid orders.
-- This table protects retries that occur before the first transaction has returned.
CREATE TABLE IF NOT EXISTS public.billing_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  response jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_idempotency_order
  ON public.billing_idempotency_keys(restaurant_id, order_id, created_at DESC);

ALTER TABLE public.billing_idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_idempotency_service_only ON public.billing_idempotency_keys;
CREATE POLICY billing_idempotency_service_only
ON public.billing_idempotency_keys
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- KOT hardening: one operational KOT per order. Existing triggers already create
-- KOT/kitchen tickets automatically when an order is inserted. Remove any
-- historical duplicates before adding the invariant.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY order_id ORDER BY created_at, id) AS rn
  FROM public.kot_tickets
)
DELETE FROM public.kot_tickets k USING ranked r
WHERE k.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY order_id ORDER BY created_at, id) AS rn
  FROM public.kitchen_order_tickets
)
DELETE FROM public.kitchen_order_tickets k USING ranked r
WHERE k.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_kot_tickets_order_id
  ON public.kot_tickets(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kitchen_order_tickets_order_id
  ON public.kitchen_order_tickets(order_id);

-- Future aggregator integrations can remain credential-free today. When a
-- restaurant later supplies webhook_secret, the application automatically
-- verifies HMAC signatures; no schema/API URL change is required.
COMMIT;
