BEGIN;
-- Historical orphan payment rows are intentionally preserved. This NOT VALID
-- FK blocks new orphan payments while allowing legacy data to be repaired later.
ALTER TABLE public.order_payments
  ADD CONSTRAINT order_payments_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id)
  NOT VALID;
COMMIT;
