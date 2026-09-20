CREATE UNIQUE INDEX IF NOT EXISTS uq_p0_payment_reconciliation_ref
ON public.p0_payment_reconciliation(restaurant_id, order_id, provider, external_reference);
