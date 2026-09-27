-- Restore QR ordering plugin controls for every restaurant.
-- Safe/idempotent: preserves existing enabled state and only creates missing catalog/restaurant rows.

insert into public.plugin_catalog(
  code, name, icon, category, description, kind, active, sort_order
)
values (
  'qr-ordering-pro',
  'Advanced QR Ordering',
  '📱',
  'QR',
  'QR ordering, waiter call, bill request, reorder and upselling.',
  'feature',
  true,
  150
)
on conflict (code) do update set
  name = excluded.name,
  icon = excluded.icon,
  category = excluded.category,
  description = excluded.description,
  kind = excluded.kind,
  active = true,
  sort_order = excluded.sort_order;

insert into public.plugin_catalog(
  code, name, icon, category, description, kind, active, sort_order
)
values (
  'qr-menu',
  'QR Menu Runtime',
  '📱',
  'QR',
  'Legacy runtime alias for Advanced QR Ordering.',
  'feature',
  true,
  151
)
on conflict (code) do update set
  name = excluded.name,
  icon = excluded.icon,
  category = excluded.category,
  description = excluded.description,
  kind = excluded.kind,
  active = true,
  sort_order = excluded.sort_order;

insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config,
  display_name, category, description, feature_kind
)
select r.id, c.code, c.code, false, '{}'::jsonb,
       c.name, c.category, c.description, c.kind
from public.restaurants r
join public.plugin_catalog c
  on c.code in ('qr-ordering-pro','qr-menu')
where not exists (
  select 1
  from public.restaurant_plugins rp
  where rp.restaurant_id = r.id
    and rp.plugin_code = c.code
);

create index if not exists idx_restaurant_plugins_qr_ordering
on public.restaurant_plugins(restaurant_id, enabled)
where plugin_code in ('qr-ordering-pro','qr-menu');
