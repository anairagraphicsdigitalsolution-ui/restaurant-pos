-- Independent Restaurant Suite master plugin.
-- Safe/idempotent: never deletes or overwrites business data.
INSERT INTO public.plugin_catalog (code,name,icon,category,description,kind,active)
VALUES ('restaurant-suite','Restaurant Suite','🍽️','Core','Independent restaurant management workspace.','hub',true)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, icon=EXCLUDED.icon, category=EXCLUDED.category,
  description=EXCLUDED.description, kind=EXCLUDED.kind, active=true;

INSERT INTO public.restaurant_plugins (restaurant_id,plugin_code,plugin_slug,enabled,display_name,category,description,feature_kind)
SELECT r.id,'restaurant-suite','restaurant-suite',false,'Restaurant Suite','Core','Independent restaurant management workspace.','hub'
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1 FROM public.restaurant_plugins rp
  WHERE rp.restaurant_id=r.id AND rp.plugin_code='restaurant-suite'
);
