-- Make the two Super Admin master plugins actually toggleable.
-- NON-DESTRUCTIVE: no restaurant/business/order/plugin rows are updated or deleted.
-- Existing master rows remain intact; this migration only changes runtime rules.

BEGIN;

-- Keep master plugin rows protected from deletion, but do not force enabled=true.
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

  -- Only the two requested master switches are toggleable.
  -- Restaurant Pro keeps its historical Always-On protection.
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.plugin_code = 'restaurant-pro' THEN
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

-- Central runtime authority:
-- * Operations Hub follows its own master row.
-- * Restaurant Core follows its own master row.
-- * Core child modules follow Restaurant Core.
-- * Expenses/Cash Closing follow Operations Hub + their child settings.
-- * Restaurant Pro and Loyalty retain their existing independent semantics.
CREATE OR REPLACE FUNCTION public.is_restaurant_feature_enabled(
  p_restaurant_id uuid,
  p_plugin_code text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested AS (
    SELECT lower(trim(coalesce(p_plugin_code,''))) AS code
  )
  SELECT CASE
    WHEN requested.code = 'operations-hub' THEN EXISTS (
      SELECT 1
      FROM public.restaurant_plugins rp
      WHERE rp.restaurant_id = p_restaurant_id
        AND rp.plugin_code = 'operations-hub'
        AND rp.enabled = true
    )

    WHEN requested.code = 'expenses' THEN (
      EXISTS (
        SELECT 1 FROM public.restaurant_plugins rp
        WHERE rp.restaurant_id = p_restaurant_id
          AND rp.plugin_code = 'operations-hub'
          AND rp.enabled = true
      )
      AND COALESCE((
        SELECT (ps.config->>'expenses_enabled')::boolean
        FROM public.plugin_settings ps
        WHERE ps.restaurant_id = p_restaurant_id
          AND ps.plugin_code = 'operations-hub'
        LIMIT 1
      ), true)
    )

    WHEN requested.code = 'cash-closing' THEN (
      EXISTS (
        SELECT 1 FROM public.restaurant_plugins rp
        WHERE rp.restaurant_id = p_restaurant_id
          AND rp.plugin_code = 'operations-hub'
          AND rp.enabled = true
      )
      AND COALESCE((
        SELECT (ps.config->>'cash_closing_enabled')::boolean
        FROM public.plugin_settings ps
        WHERE ps.restaurant_id = p_restaurant_id
          AND ps.plugin_code = 'operations-hub'
        LIMIT 1
      ), true)
    )

    WHEN requested.code = 'restaurant-core' THEN EXISTS (
      SELECT 1
      FROM public.restaurant_plugins rp
      WHERE rp.restaurant_id = p_restaurant_id
        AND rp.plugin_code = 'restaurant-core'
        AND rp.enabled = true
    )

    WHEN requested.code IN (
      'pos-core','payments','takeaway','delivery','delivery-settlement',
      'token-management','split-merge-bills','table-management','table-transfer',
      'refunds-voids','discounts-tax','e-bill','kds','kds-stations'
    ) THEN EXISTS (
      SELECT 1
      FROM public.restaurant_plugins rp
      WHERE rp.restaurant_id = p_restaurant_id
        AND rp.plugin_code = 'restaurant-core'
        AND rp.enabled = true
    )

    WHEN requested.code = 'restaurant-pro' THEN EXISTS (
      SELECT 1
      FROM public.restaurant_plugins rp
      WHERE rp.restaurant_id = p_restaurant_id
        AND rp.plugin_code = 'restaurant-pro'
        AND rp.enabled = true
    )

    WHEN requested.code = 'loyalty' THEN EXISTS (
      SELECT 1
      FROM public.restaurant_plugins rp
      WHERE rp.restaurant_id = p_restaurant_id
        AND rp.plugin_code = 'loyalty'
        AND rp.enabled = true
    )

    ELSE (
      EXISTS (
        SELECT 1
        FROM public.restaurant_plugins rp
        WHERE rp.restaurant_id = p_restaurant_id
          AND rp.plugin_code = requested.code
          AND rp.enabled = true
      )
      AND EXISTS (
        SELECT 1
        FROM public.restaurant_plugins master
        WHERE master.restaurant_id = p_restaurant_id
          AND master.plugin_code = 'restaurant-pro'
          AND master.enabled = true
      )
    )
  END
  FROM requested;
$$;

GRANT EXECUTE ON FUNCTION public.is_restaurant_feature_enabled(uuid,text) TO authenticated, service_role;

COMMIT;
