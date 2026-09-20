-- Operations Hub optional controls: Expenses + Cash Closing.
-- Operations Hub remains the master workspace. Only these two child controls
-- are independently switchable by Super Admin. Existing data is preserved.

-- Seed safe defaults for every restaurant.
INSERT INTO public.plugin_settings (restaurant_id, plugin_code, config)
SELECT r.id, 'operations-hub',
       jsonb_build_object(
         'expenses_enabled', true,
         'cash_closing_enabled', true
       )
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plugin_settings ps
  WHERE ps.restaurant_id = r.id
    AND ps.plugin_code = 'operations-hub'
);

-- Normalize existing Operations Hub settings without overriding an explicit
-- Super Admin choice.
UPDATE public.plugin_settings
SET config =
  jsonb_set(
    jsonb_set(
      COALESCE(config,'{}'::jsonb),
      '{expenses_enabled}',
      COALESCE(config->'expenses_enabled','true'::jsonb),
      true
    ),
    '{cash_closing_enabled}',
    COALESCE(config->'cash_closing_enabled','true'::jsonb),
    true
  )
WHERE plugin_code = 'operations-hub';

-- Add audit/report fields without rewriting existing closings.
ALTER TABLE public.cash_closings
  ADD COLUMN IF NOT EXISTS cash_in numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_out numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expense_cash numeric(14,2) NOT NULL DEFAULT 0;

-- Keep the runtime gate centralized.
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

    WHEN requested.code IN (
      'restaurant-core','pos-core','payments','takeaway','delivery',
      'delivery-settlement','token-management','split-merge-bills',
      'table-management','table-transfer','refunds-voids','discounts-tax',
      'e-bill','kds','kds-stations'
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

GRANT EXECUTE ON FUNCTION public.is_restaurant_feature_enabled(uuid,text)
  TO authenticated, service_role;

-- Historical reads remain available for reporting. Writes require the child
-- feature to be enabled, so disabling a module never deletes old data.
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expenses_staff_permission ON public.expenses;
DROP POLICY IF EXISTS expenses_scoped ON public.expenses;
DROP POLICY IF EXISTS "restaurant members expenses" ON public.expenses;

CREATE POLICY expenses_select_restaurant
ON public.expenses FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY expenses_insert_feature
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.is_restaurant_feature_enabled(restaurant_id,'expenses')
);

CREATE POLICY expenses_update_feature
ON public.expenses FOR UPDATE TO authenticated
USING (
  public.is_restaurant_member(restaurant_id)
  AND public.is_restaurant_feature_enabled(restaurant_id,'expenses')
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.is_restaurant_feature_enabled(restaurant_id,'expenses')
);

CREATE POLICY expenses_delete_feature
ON public.expenses FOR DELETE TO authenticated
USING (
  public.is_restaurant_member(restaurant_id)
  AND public.is_restaurant_feature_enabled(restaurant_id,'expenses')
);

ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_scoped ON public.cash_closings;
DROP POLICY IF EXISTS cash_closing_feature ON public.cash_closings;

CREATE POLICY cash_closing_select_restaurant
ON public.cash_closings FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY cash_closing_insert_feature
ON public.cash_closings FOR INSERT TO authenticated
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.is_restaurant_feature_enabled(restaurant_id,'cash-closing')
);

CREATE POLICY cash_closing_update_feature
ON public.cash_closings FOR UPDATE TO authenticated
USING (
  public.is_restaurant_member(restaurant_id)
  AND public.is_restaurant_feature_enabled(restaurant_id,'cash-closing')
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.is_restaurant_feature_enabled(restaurant_id,'cash-closing')
);
