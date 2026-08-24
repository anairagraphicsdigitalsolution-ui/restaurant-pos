-- Final plugin architecture:
-- Core POS + Operations Hub are always available.
-- Loyalty is independent and is NOT part of Restaurant Pro.
-- Restaurant Pro is a master switch for all remaining advanced feature plugins.
-- No customer/order/menu/payment data is deleted.

-- Ensure the three top-level hub rows exist.
INSERT INTO public.restaurant_plugins
  (restaurant_id, plugin_code, plugin_slug, enabled, config, display_name, category, description, feature_kind)
SELECT r.id, v.code, v.code, true, '{}'::jsonb, v.name, 'Core Hubs', v.description, 'hub'
FROM public.restaurants r
CROSS JOIN (
  VALUES
    ('operations-hub','Operations Hub','Always-available restaurant operations workspace.'),
    ('restaurant-core','Restaurant Core','Always-available core POS foundation.'),
    ('restaurant-pro','Restaurant Pro','Master switch for advanced restaurant features.')
) AS v(code,name,description)
WHERE v.code <> 'restaurant-pro'
  AND NOT EXISTS (
    SELECT 1 FROM public.restaurant_plugins rp
    WHERE rp.restaurant_id=r.id AND rp.plugin_code=v.code
  );

-- Core rows are always ON. This intentionally does not touch Loyalty or
-- Restaurant Pro child features.
UPDATE public.restaurant_plugins
SET enabled = true
WHERE plugin_code IN (
    'operations-hub',
    'restaurant-core',
    'pos-core',
    'payments',
    'takeaway',
    'delivery',
    'delivery-settlement',
    'token-management',
    'split-merge-bills',
    'table-management',
    'table-transfer',
    'refunds-voids',
    'discounts-tax',
    'e-bill',
    'cash-closing',
    'kds',
    'kds-stations'
);

-- Ensure a Restaurant Pro master row exists, preserving its current state.
INSERT INTO public.restaurant_plugins
  (restaurant_id, plugin_code, plugin_slug, enabled, config, display_name, category, description, feature_kind)
SELECT r.id, 'restaurant-pro', 'restaurant-pro', false, '{}'::jsonb,
       'Restaurant Pro', 'Core Hubs',
       'Master switch for advanced restaurant features.',
       'hub'
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1 FROM public.restaurant_plugins rp
  WHERE rp.restaurant_id=r.id AND rp.plugin_code='restaurant-pro'
);

-- Central DB runtime gate:
-- Core = always available
-- Loyalty = independent
-- Pro feature = feature row AND Restaurant Pro master
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
    SELECT lower(trim(COALESCE(p_plugin_code,''))) AS code
  )
  SELECT CASE
    WHEN requested.code IN (
      'operations-hub',
    'restaurant-core',
    'pos-core',
    'payments',
    'takeaway',
    'delivery',
    'delivery-settlement',
    'token-management',
    'split-merge-bills',
    'table-management',
    'table-transfer',
    'refunds-voids',
    'discounts-tax',
    'e-bill',
    'cash-closing',
    'kds',
    'kds-stations'
    ) THEN true

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

GRANT EXECUTE ON FUNCTION public.is_restaurant_feature_enabled(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant_feature_enabled(uuid,text) TO service_role;

CREATE INDEX IF NOT EXISTS idx_restaurant_plugins_runtime_gate
  ON public.restaurant_plugins(restaurant_id, plugin_code, enabled);
