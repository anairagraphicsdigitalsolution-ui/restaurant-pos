-- Final hardening repair (post 20260825224000): safe/idempotent follow-up for managed Supabase.
-- This migration intentionally avoids destructive data changes.
BEGIN;

-- The Advisor fix is safe even if the analytics view is absent in a fresh
-- environment; the DO block simply skips it.
DO $$
BEGIN
  IF to_regclass('public.restaurant_daily_payment_summary') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.restaurant_daily_payment_summary SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL ON public.restaurant_daily_payment_summary FROM anon';
    EXECUTE 'GRANT SELECT ON public.restaurant_daily_payment_summary TO authenticated';
  END IF;
END $$;

-- Keep aggregator credentials ready for future provider activation.
-- No provider is activated and no secret is required at install time.
ALTER TABLE IF EXISTS public.aggregator_integrations
  ADD COLUMN IF NOT EXISTS webhook_signature_header text,
  ADD COLUMN IF NOT EXISTS webhook_signature_algorithm text NOT NULL DEFAULT 'sha256',
  ADD COLUMN IF NOT EXISTS webhook_signature_prefix text NOT NULL DEFAULT 'sha256=';

-- Helpful index for provider/outlet webhook resolution.
CREATE INDEX IF NOT EXISTS idx_aggregator_integrations_provider_outlet
  ON public.aggregator_integrations(provider, outlet_code, active);

COMMIT;
