-- Anaira delivery zone management.
-- Non-destructive: keeps the existing delivery_zones table and data.
-- Adds timestamps/indexing so the dashboard can safely manage zones.

alter table public.delivery_zones
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.delivery_zones
set
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where created_at is null
   or updated_at is null;

create index if not exists idx_delivery_zones_restaurant_active_name
  on public.delivery_zones(restaurant_id, active, name);

create index if not exists idx_delivery_zones_restaurant_name
  on public.delivery_zones(restaurant_id, name);

alter table public.delivery_zones enable row level security;

drop policy if exists "restaurant members delivery_zones" on public.delivery_zones;
create policy "restaurant members delivery_zones"
on public.delivery_zones
for all
using (
  restaurant_id = (
    select restaurant_id
    from public.profiles
    where id = auth.uid()
  )
)
with check (
  restaurant_id = (
    select restaurant_id
    from public.profiles
    where id = auth.uid()
  )
);

create or replace function public.touch_delivery_zone_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_delivery_zones_updated_at on public.delivery_zones;
create trigger trg_delivery_zones_updated_at
before update on public.delivery_zones
for each row
execute function public.touch_delivery_zone_updated_at();

grant execute on function public.touch_delivery_zone_updated_at() to authenticated;
grant execute on function public.touch_delivery_zone_updated_at() to service_role;
