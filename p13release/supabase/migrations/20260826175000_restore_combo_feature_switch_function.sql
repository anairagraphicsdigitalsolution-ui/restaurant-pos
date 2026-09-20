-- Restore combo feature switch function before production security grants reference it.
CREATE OR REPLACE FUNCTION public.enforce_combo_feature_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.item_type, 'single') = 'combo'
     AND NOT public.is_super_admin()
     AND NOT public.offers_combos_enabled(NEW.restaurant_id, 'combos') THEN
    RAISE EXCEPTION 'Combos are disabled by Super Admin';
  END IF;
  RETURN NEW;
END;
$$;
DO $$ BEGIN IF to_regprocedure('public.enforce_combo_feature_switch()') IS NOT NULL THEN EXECUTE 'ALTER FUNCTION public.enforce_combo_feature_switch() OWNER TO postgres'; END IF; END $$;