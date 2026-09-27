-- Anaira: restaurant-admin floor management
-- Floors belong to the restaurant tenant. Restaurant admins can manage them.
create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create index if not exists idx_floors_restaurant_order
  on public.floors(restaurant_id, display_order, name);

alter table public.floors enable row level security;

drop policy if exists "floors_select_authenticated_own" on public.floors;
create policy "floors_select_authenticated_own"
  on public.floors for select to authenticated
  using (public.is_super_admin() or restaurant_id = public.current_restaurant_id());

drop policy if exists "floors_insert_admin" on public.floors;
create policy "floors_insert_admin"
  on public.floors for insert to authenticated
  with check (public.can_manage_restaurant(restaurant_id));

drop policy if exists "floors_update_admin" on public.floors;
create policy "floors_update_admin"
  on public.floors for update to authenticated
  using (public.can_manage_restaurant(restaurant_id))
  with check (public.can_manage_restaurant(restaurant_id));

drop policy if exists "floors_delete_admin" on public.floors;
create policy "floors_delete_admin"
  on public.floors for delete to authenticated
  using (public.can_manage_restaurant(restaurant_id));

-- Keep the existing table.floor model compatible while introducing managed floors.
-- Existing restaurants get their current floor names, and empty restaurants get Ground Floor.
insert into public.floors (restaurant_id, name, display_order)
select r.id, 'Ground Floor', 0
from public.restaurants r
where not exists (
  select 1 from public.floors f where f.restaurant_id = r.id
)
on conflict (restaurant_id, name) do nothing;

insert into public.floors (restaurant_id, name, display_order)
select distinct t.restaurant_id, trim(t.floor), 0
from public.tables t
where t.restaurant_id is not null
  and nullif(trim(t.floor), '') is not null
on conflict (restaurant_id, name) do nothing;

-- New tables default to the first active floor for the restaurant.
