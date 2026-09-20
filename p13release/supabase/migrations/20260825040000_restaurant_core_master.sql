-- Restaurant Core is now a real Super Admin-controlled master plugin.
-- Existing restaurants are seeded ON so this change does not interrupt production.
INSERT INTO public.restaurant_plugins
  (restaurant_id, plugin_code, plugin_slug, enabled, display_name, category, description, feature_kind)
SELECT
  r.id,
  'restaurant-core',
  'restaurant-core',
  true,
  'Restaurant Core',
  'Core',
  'Core POS, orders, tables, KDS, billing and delivery master switch.',
  'core'
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1 FROM public.restaurant_plugins rp
  WHERE rp.restaurant_id = r.id
    AND rp.plugin_code = 'restaurant-core'
);

CREATE INDEX IF NOT EXISTS idx_restaurant_plugins_core_master
  ON public.restaurant_plugins(restaurant_id, plugin_code, enabled);
