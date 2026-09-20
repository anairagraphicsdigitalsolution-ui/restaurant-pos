-- Anaira: rooms use the same restaurant floor structure as tables.
alter table public.rooms add column if not exists floor text;

create index if not exists idx_rooms_restaurant_floor
  on public.rooms(restaurant_id, floor, room_number);

update public.rooms r
set floor = coalesce(nullif(trim(r.floor), ''), (
  select f.name from public.floors f
  where f.restaurant_id = r.restaurant_id and f.active = true
  order by f.display_order, f.name
  limit 1
), 'Ground Floor')
where r.floor is null or nullif(trim(r.floor), '') is null;
