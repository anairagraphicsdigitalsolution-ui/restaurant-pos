-- Restaurant Suite is a separately activatable top-level plugin.
-- Payment QR / Merchant Payments remains a separate plugin and menu item.
-- Existing restaurant data and plugin states are preserved.

insert into public.plugin_catalog(
  code,name,icon,category,description,kind,sort_order,active
) values (
  'restaurant-suite',
  'Restaurant Suite',
  '🍽️',
  'Core Hubs',
  'Complete restaurant operations workspace. Its menu appears only when this plugin is activated by Super Admin.',
  'hub',
  5,
  true
)
on conflict(code) do update set
  name=excluded.name,
  icon=excluded.icon,
  category=excluded.category,
  description=excluded.description,
  kind=excluded.kind,
  active=true,
  sort_order=excluded.sort_order;

-- Add the plugin row for existing restaurants without changing any existing
-- enabled/disabled state. It starts OFF and must be explicitly activated.
insert into public.restaurant_plugins(
  restaurant_id,plugin_code,plugin_slug,enabled,config,
  display_name,category,description,feature_kind
)
select r.id,'restaurant-suite','restaurant-suite',false,'{}'::jsonb,
       'Restaurant Suite','Core Hubs',
       'Complete restaurant operations workspace. Its menu appears only when this plugin is activated by Super Admin.',
       'hub'
from public.restaurants r
where not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id=r.id and rp.plugin_code='restaurant-suite'
);
