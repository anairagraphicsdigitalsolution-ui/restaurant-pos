BEGIN;

-- Restore only the authenticated EXECUTE grants required by RLS and
-- browser-side application RPCs. Anonymous access remains revoked.
GRANT EXECUTE ON FUNCTION public.current_restaurant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_restaurant(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_restaurant_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_restaurant_plan_feature(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_discount_rule(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_loyalty_config(uuid) TO authenticated;

-- Keep privileged destructive/admin RPCs server-side unless the application
-- explicitly exposes them through an authenticated API route.
DO $$ BEGIN IF to_regprocedure('public.delete_restaurant_cascade(uuid)') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.delete_restaurant_cascade(uuid) FROM anon, authenticated'; END IF; END $$;
COMMIT;
