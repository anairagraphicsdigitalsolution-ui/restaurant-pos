-- Theme, Branding and Restaurant Settings are Super-Admin-controlled plugins.
-- Existing restaurant behavior is preserved by activating them by default.
-- Theme scope is independently configurable for POS, QR or both.

INSERT INTO public.plugin_catalog(
  code,name,icon,category,description,kind,active,sort_order
)
VALUES
(
  'theme-branding',
  'Theme & Branding',
  '🎨',
  'Appearance',
  'Restaurant theme, logo and white-label branding. Super Admin controls whether the selected theme is available on Restaurant, QR, or both.',
  'feature',
  true,
  160
),
(
  'restaurant-settings',
  'Restaurant Settings',
  '⚙️',
  'Settings',
  'Restaurant configuration and operational settings controlled by Super Admin.',
  'feature',
  true,
  161
)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name,
  icon = excluded.icon,
  category = excluded.category,
  description = excluded.description,
  kind = excluded.kind,
  active = true,
  sort_order = excluded.sort_order;

-- Existing restaurants receive the plugins without changing any existing data.
INSERT INTO public.restaurant_plugins(
  restaurant_id,
  plugin_code,
  plugin_slug,
  enabled,
  config,
  display_name,
  category,
  description,
  feature_kind
)
SELECT
  r.id,
  c.code,
  c.code,
  true,
  '{}'::jsonb,
  c.name,
  c.category,
  c.description,
  c.kind
FROM public.restaurants r
JOIN public.plugin_catalog c
  ON c.code IN ('theme-branding','restaurant-settings')
WHERE NOT EXISTS (
  SELECT 1
  FROM public.restaurant_plugins rp
  WHERE rp.restaurant_id = r.id
    AND rp.plugin_code = c.code
);

-- Default Theme & Branding policy:
-- "both" means the selected restaurant theme is used by both POS and QR.
INSERT INTO public.plugin_settings(
  restaurant_id,
  plugin_code,
  config
)
SELECT
  r.id,
  'theme-branding',
  '{"theme_scope":"both","show_restaurant_logo":true,"show_brand_name":true}'::jsonb
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plugin_settings ps
  WHERE ps.restaurant_id = r.id
    AND ps.plugin_code = 'theme-branding'
);

INSERT INTO public.plugin_settings(
  restaurant_id,
  plugin_code,
  config
)
SELECT
  r.id,
  'restaurant-settings',
  '{"allow_admin_branding_changes":true,"allow_admin_theme_changes":true,"allow_admin_operational_settings":true}'::jsonb
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plugin_settings ps
  WHERE ps.restaurant_id = r.id
    AND ps.plugin_code = 'restaurant-settings'
);

CREATE INDEX IF NOT EXISTS idx_restaurant_plugins_theme_branding
ON public.restaurant_plugins(restaurant_id, enabled)
WHERE plugin_code = 'theme-branding';

CREATE INDEX IF NOT EXISTS idx_plugin_settings_theme_branding
ON public.plugin_settings(restaurant_id, plugin_code)
WHERE plugin_code IN ('theme-branding','restaurant-settings');
