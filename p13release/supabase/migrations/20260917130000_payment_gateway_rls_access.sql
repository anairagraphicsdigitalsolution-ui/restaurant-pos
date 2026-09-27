-- Restore authenticated access required by the Payment Gateway admin UI.
-- payment_webhook_events remains server-only; gateway configs remain RLS scoped.
BEGIN;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payment_gateway_configs TO authenticated;
REVOKE ALL ON TABLE public.payment_webhook_events FROM anon, authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
