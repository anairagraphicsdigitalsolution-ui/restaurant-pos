-- Protect POS master services from accidental plugin toggles/deletes.
-- Optional plugins remain independently switchable.
CREATE OR REPLACE FUNCTION public.protect_plugin_master_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.plugin_code IN ('restaurant-core','operations-hub') THEN
      RAISE EXCEPTION 'Protected plugin % cannot be deleted', OLD.plugin_code;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.plugin_code IN ('restaurant-core','operations-hub') THEN
    NEW.enabled := true;
    NEW.disabled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_plugin_master_services ON public.restaurant_plugins;
CREATE TRIGGER trg_protect_plugin_master_services
BEFORE INSERT OR UPDATE OR DELETE ON public.restaurant_plugins
FOR EACH ROW
EXECUTE FUNCTION public.protect_plugin_master_services();
UPDATE public.restaurant_plugins
SET enabled = true, disabled_at = NULL
WHERE plugin_code IN ('restaurant-core','operations-hub');
