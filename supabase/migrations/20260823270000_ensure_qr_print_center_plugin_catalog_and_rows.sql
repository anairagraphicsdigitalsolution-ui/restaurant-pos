-- Ensure QR Print Center exists as an independent plugin.
-- Safe/idempotent: existing enabled state is never changed.
insert into public.plugin_catalog(
  code, name, icon, category, description, kind, active, sort_order
)
values (
  'qr-print-center',
  'QR Print Center',
  '🖨️',
  'QR',
  'Restaurant QR card generation, preview, download and printing. Enabled independently by Super Admin.',
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
  active = true;

insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config,
  display_name, category, description, feature_kind
)
select r.id, 'qr-print-center', 'qr-print-center', false, '{}'::jsonb,
       c.name, c.category, c.description, c.kind
from public.restaurants r
cross join public.plugin_catalog c
where c.code = 'qr-print-center'
  and not exists (
    select 1
    from public.restaurant_plugins rp
    where rp.restaurant_id = r.id
      and rp.plugin_code = 'qr-print-center'
  );
