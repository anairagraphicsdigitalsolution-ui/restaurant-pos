-- Super Admin control for the three restaurant control hubs
-- All three are OFF by default for every restaurant.

insert into public.restaurant_plugins (restaurant_id, plugin_code, plugin_slug, enabled, config)
select r.id, v.code, v.code, false, '{}'::jsonb
from public.restaurants r
cross join (values
  ('operations-hub'),
  ('restaurant-core'),
  ('restaurant-pro')
) as v(code)
where not exists (
  select 1
  from public.restaurant_plugins rp
  where rp.restaurant_id = r.id
    and rp.plugin_code = v.code
);

create index if not exists idx_restaurant_plugins_hub_controls
on public.restaurant_plugins(restaurant_id, plugin_code, enabled);
