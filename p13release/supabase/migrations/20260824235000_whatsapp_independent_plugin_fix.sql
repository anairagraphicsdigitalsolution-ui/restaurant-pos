-- WhatsApp is an independent integration plugin.
-- Canonical code: whatsapp-invoice. Legacy code: whatsapp.
-- No data is deleted.

INSERT INTO public.restaurant_plugins
  (restaurant_id, plugin_code, plugin_slug, enabled, config, display_name, category, description, feature_kind)
SELECT
  r.id,
  'whatsapp-invoice',
  'whatsapp-invoice',
  COALESCE(legacy.enabled, false),
  '{}'::jsonb,
  'WhatsApp Invoice',
  'Integrations',
  'Send invoices and customer documents through WhatsApp.',
  'integration'
FROM public.restaurants r
LEFT JOIN public.restaurant_plugins legacy
  ON legacy.restaurant_id = r.id
 AND legacy.plugin_code = 'whatsapp'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.restaurant_plugins canonical
  WHERE canonical.restaurant_id = r.id
    AND canonical.plugin_code = 'whatsapp-invoice'
);

INSERT INTO public.plugin_settings (restaurant_id, plugin_code, config)
SELECT
  legacy.restaurant_id,
  'whatsapp-invoice',
  legacy.config
FROM public.plugin_settings legacy
WHERE legacy.plugin_code = 'whatsapp'
  AND NOT EXISTS (
    SELECT 1 FROM public.plugin_settings canonical
    WHERE canonical.restaurant_id = legacy.restaurant_id
      AND canonical.plugin_code = 'whatsapp-invoice'
  );
