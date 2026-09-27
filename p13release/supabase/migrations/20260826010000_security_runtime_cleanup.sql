BEGIN;

-- Lock down SECURITY DEFINER functions in the exposed public schema.
-- Anonymous RPC is retained only for the intentionally public rating summary.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname <> 'get_public_rating_summary'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.signature);
  END LOOP;
END $$;

ALTER FUNCTION public.set_whatsapp_config(uuid,text) SET search_path = public;
ALTER FUNCTION public.make_restaurant_slug(text,uuid) SET search_path = public;
ALTER FUNCTION public.set_restaurant_slug() SET search_path = public;
ALTER FUNCTION public.calculate_delivery_settlement_difference(numeric,numeric,numeric,numeric,numeric,numeric) SET search_path = public;

DROP INDEX IF EXISTS public.idx_audit_restaurant;
DROP INDEX IF EXISTS public.uq_loyalty_rewards_restaurant_name;
DROP INDEX IF EXISTS public.idx_plugin_settings_restaurant_id;
DROP INDEX IF EXISTS public.idx_payment_accounts_restaurant_active;
DROP INDEX IF EXISTS public.idx_restaurant_plugins_core_master;
DROP INDEX IF EXISTS public.idx_restaurant_plugins_feature;
DROP INDEX IF EXISTS public.idx_restaurant_plugins_hub_controls;
DROP INDEX IF EXISTS public.idx_restaurant_plugins_runtime_gate;
DROP INDEX IF EXISTS public.idx_subscriptions_saas_plan;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

COMMIT;
