-- Independent QR Print Center plugin.
-- Advanced QR Ordering controls the customer ordering experience.
-- QR Print Center independently controls admin QR generation/download/printing.

insert into public.plugin_catalog(
  code, name, icon, category, description, kind, active, sort_order
)
values (
  'qr-print-center',
  'QR Print Center',
  '🖨️',
  'QR',
  'Restaurant QR card generation, preview, download and printing.',
  'feature',
  true,
  152
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
select r.id, 'qr-print-center', 'qr-print-center', false, '{}'::jsonb,
       c.name, c.category, c.description, c.kind
from public.restaurants r
join public.plugin_catalog c on c.code = 'qr-print-center'
where not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id = r.id
    and rp.plugin_code = 'qr-print-center'
);

create index if not exists idx_restaurant_plugins_qr_print_center
on public.restaurant_plugins(restaurant_id, enabled)
where plugin_code = 'qr-print-center';
