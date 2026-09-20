-- Final hardening for QR Print Center and table/room creation.
-- Safe/idempotent: does not alter existing enabled states.
insert into public.plugin_catalog(code,name,icon,category,description,kind,sort_order,active)
values (
  'qr-print-center',
  'QR Print Center',
  '🖨️',
  'QR',
  'Restaurant QR card generation, preview, download and printing. Enabled independently by Super Admin.',
  'feature',
  361,
  true
)
on conflict (code) do update set
  name = excluded.name,
  icon = excluded.icon,
  category = excluded.category,
  description = excluded.description,
  kind = excluded.kind,
  sort_order = excluded.sort_order,
  active = true;

insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config,
  display_name, category, description, feature_kind
)
select r.id, 'qr-print-center', 'qr-print-center', false, '{}'::jsonb,
       c.name, c.category, c.description, c.kind
from public.restaurants r
join public.plugin_catalog c on c.code='qr-print-center'
where not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id=r.id and rp.plugin_code='qr-print-center'
);

create index if not exists idx_tables_restaurant_number
  on public.tables(restaurant_id, table_number);
create index if not exists idx_rooms_restaurant_number
  on public.rooms(restaurant_id, room_number);

-- Ensure the intended tenant-scoped admin policies exist.
drop policy if exists tables_insert_admin on public.tables;
create policy tables_insert_admin on public.tables
for insert to authenticated
with check (public.can_manage_restaurant(restaurant_id));

drop policy if exists rooms_insert_admin on public.rooms;
create policy rooms_insert_admin on public.rooms
for insert to authenticated
with check (public.can_manage_restaurant(restaurant_id));
