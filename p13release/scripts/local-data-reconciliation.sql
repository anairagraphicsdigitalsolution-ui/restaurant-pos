-- Anaira local-data reconciliation policy.
-- Cloud is the authoritative SaaS master. This script only removes the known
-- audit-only local test restaurant that exists in the local backup but not Cloud.
-- It does not touch the real NH3 restaurant or any production orders.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.restaurants WHERE id='00000000-0000-0000-0000-000000000506') THEN
    DELETE FROM public.restaurants WHERE id='00000000-0000-0000-0000-000000000506';
  END IF;
END $$;
COMMIT;
