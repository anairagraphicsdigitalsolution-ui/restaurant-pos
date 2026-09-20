-- Restaurant Suite is an independent master plugin.
-- Additive only: does not delete or alter existing restaurant business data.
INSERT INTO public.plugin_catalog
  (code,name,icon,category,description,kind,sort_order,active)
VALUES
  ('restaurant-suite','Restaurant Suite','🍽️','Core',
   'Restaurant management workspace for Restaurant Admin: Control Center, Advanced Operations, Operations and Anaira Suite.',
   'hub',3,true)
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,
  icon=excluded.icon,
  category=excluded.category,
  description=excluded.description,
  kind=excluded.kind,
  sort_order=excluded.sort_order,
  active=true;

-- Seed the plugin row only where it does not already exist.
-- Existing enabled/disabled state is never changed.
INSERT INTO public.restaurant_plugins
  (restaurant_id, plugin_code, plugin_slug, enabled, config,
   display_name, category, description, feature_kind)
SELECT
  r.id,
  'restaurant-suite',
  'restaurant-suite',
  false,
  '{}'::jsonb,
  'Restaurant Suite',
  'Core',
  'Restaurant management workspace.',
  'hub'
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.restaurant_plugins rp
  WHERE rp.restaurant_id=r.id
    AND rp.plugin_code='restaurant-suite'
);
