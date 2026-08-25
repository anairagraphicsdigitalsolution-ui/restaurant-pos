BEGIN;

-- Runtime security correction:
-- These SECURITY DEFINER helpers are intentionally called by RLS policies
-- for authenticated users. Anonymous execution remains revoked.

GRANT EXECUTE ON FUNCTION public.current_restaurant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_restaurant(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_restaurant_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff_or_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_restaurant_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_restaurant(uuid) FROM anon;

-- Protect platform master plugins from direct DB deletion/disable.
-- restaurant_plugins does not have installed or updated_at columns.
CREATE OR REPLACE FUNCTION public.protect_plugin_master_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.plugin_code IN ('restaurant-core','operations-hub','restaurant-pro') THEN
      RAISE EXCEPTION 'Protected plugin % cannot be deleted', OLD.plugin_code;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.plugin_code IN ('restaurant-core','operations-hub','restaurant-pro') THEN
    NEW.enabled := true;
    NEW.disabled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_plugin_master_services() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_plugin_master_services ON public.restaurant_plugins;
CREATE TRIGGER trg_protect_plugin_master_services
BEFORE INSERT OR UPDATE OR DELETE ON public.restaurant_plugins
FOR EACH ROW EXECUTE FUNCTION public.protect_plugin_master_services();

UPDATE public.restaurant_plugins
SET enabled = true,
    disabled_at = NULL
WHERE plugin_code IN ('restaurant-core','operations-hub','restaurant-pro');

COMMIT;
