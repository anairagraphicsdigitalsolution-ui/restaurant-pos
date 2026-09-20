-- Anaira Phase 7: Enterprise / Multi-Outlet Control Plane
-- Non-destructive: adds enterprise metadata and control tables only.

create table if not exists public.enterprise_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  code text,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enterprise_members (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprise_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','enterprise_admin','finance','operations','menu_manager','inventory_manager','viewer')),
  created_at timestamptz not null default now(),
  unique (enterprise_id, user_id)
);

create table if not exists public.enterprise_outlets (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprise_groups(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  outlet_code text,
  outlet_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enterprise_id, restaurant_id),
  unique (enterprise_id, outlet_code)
);

create table if not exists public.enterprise_menu_catalog (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprise_groups(id) on delete cascade,
  name text not null,
  category text,
  description text,
  image text,
  base_price numeric not null default 0 check (base_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enterprise_menu_prices (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprise_groups(id) on delete cascade,
  catalog_item_id uuid not null references public.enterprise_menu_catalog(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  price numeric not null check (price >= 0),
  available boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (catalog_item_id, restaurant_id)
);

create table if not exists public.enterprise_inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprise_groups(id) on delete cascade,
  from_restaurant_id uuid not null references public.restaurants(id),
  to_restaurant_id uuid not null references public.restaurants(id),
  inventory_id uuid references public.inventory(id) on delete set null,
  item_name text not null,
  quantity numeric not null check (quantity > 0),
  unit text,
  status text not null default 'requested' check (status in ('requested','approved','in_transit','received','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  received_at timestamptz,
  notes text
);

create table if not exists public.enterprise_devices (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprise_groups(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  device_key text not null,
  device_name text,
  device_type text not null default 'pos' check (device_type in ('pos','kds','printer','calling','display','scanner','other')),
  platform text,
  last_seen_at timestamptz,
  status text not null default 'active' check (status in ('active','disabled','retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (enterprise_id, device_key)
);

create table if not exists public.enterprise_audit_logs (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references public.enterprise_groups(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_enterprise_members_user on public.enterprise_members(user_id, enterprise_id);
create index if not exists idx_enterprise_outlets_enterprise on public.enterprise_outlets(enterprise_id, is_active);
create index if not exists idx_enterprise_menu_catalog_enterprise on public.enterprise_menu_catalog(enterprise_id, active);
create index if not exists idx_enterprise_menu_prices_restaurant on public.enterprise_menu_prices(restaurant_id, catalog_item_id);
create index if not exists idx_enterprise_transfers_enterprise on public.enterprise_inventory_transfers(enterprise_id, status, requested_at desc);
create index if not exists idx_enterprise_devices_restaurant on public.enterprise_devices(restaurant_id, status);
create index if not exists idx_enterprise_audit_enterprise on public.enterprise_audit_logs(enterprise_id, created_at desc);

alter table public.enterprise_groups enable row level security;
alter table public.enterprise_members enable row level security;
alter table public.enterprise_outlets enable row level security;
alter table public.enterprise_menu_catalog enable row level security;
alter table public.enterprise_menu_prices enable row level security;
alter table public.enterprise_inventory_transfers enable row level security;
alter table public.enterprise_devices enable row level security;
alter table public.enterprise_audit_logs enable row level security;

-- Policies are intentionally narrow. Server APIs also enforce the same enterprise membership.
drop policy if exists enterprise_groups_member_select on public.enterprise_groups;
create policy enterprise_groups_member_select on public.enterprise_groups for select to authenticated
using (exists (select 1 from public.enterprise_members m where m.enterprise_id = enterprise_groups.id and m.user_id = auth.uid()));

drop policy if exists enterprise_members_self_select on public.enterprise_members;
create policy enterprise_members_self_select on public.enterprise_members for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.enterprise_members m2 where m2.enterprise_id = enterprise_members.enterprise_id and m2.user_id = auth.uid() and m2.role in ('owner','enterprise_admin')));

drop policy if exists enterprise_outlets_member_select on public.enterprise_outlets;
create policy enterprise_outlets_member_select on public.enterprise_outlets for select to authenticated
using (exists (select 1 from public.enterprise_members m where m.enterprise_id = enterprise_outlets.enterprise_id and m.user_id = auth.uid()));

drop policy if exists enterprise_menu_catalog_member_select on public.enterprise_menu_catalog;
create policy enterprise_menu_catalog_member_select on public.enterprise_menu_catalog for select to authenticated
using (exists (select 1 from public.enterprise_members m where m.enterprise_id = enterprise_menu_catalog.enterprise_id and m.user_id = auth.uid()));

drop policy if exists enterprise_menu_prices_member_select on public.enterprise_menu_prices;
create policy enterprise_menu_prices_member_select on public.enterprise_menu_prices for select to authenticated
using (exists (select 1 from public.enterprise_members m where m.enterprise_id = enterprise_menu_prices.enterprise_id and m.user_id = auth.uid()));

drop policy if exists enterprise_transfers_member_select on public.enterprise_inventory_transfers;
create policy enterprise_transfers_member_select on public.enterprise_inventory_transfers for select to authenticated
using (exists (select 1 from public.enterprise_members m where m.enterprise_id = enterprise_inventory_transfers.enterprise_id and m.user_id = auth.uid()));

drop policy if exists enterprise_devices_member_select on public.enterprise_devices;
create policy enterprise_devices_member_select on public.enterprise_devices for select to authenticated
using (exists (select 1 from public.enterprise_members m where m.enterprise_id = enterprise_devices.enterprise_id and m.user_id = auth.uid()));

drop policy if exists enterprise_audit_member_select on public.enterprise_audit_logs;
create policy enterprise_audit_member_select on public.enterprise_audit_logs for select to authenticated
using (exists (select 1 from public.enterprise_members m where m.enterprise_id = enterprise_audit_logs.enterprise_id and m.user_id = auth.uid()));

create or replace function public.phase7_enterprise_summary(p_enterprise_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  result jsonb;
begin
  select exists(select 1 from public.enterprise_members where enterprise_id=p_enterprise_id and user_id=auth.uid()) into allowed;
  if not allowed then raise exception 'Enterprise access denied'; end if;
  select jsonb_build_object(
    'enterprise', (select to_jsonb(g) from public.enterprise_groups g where g.id=p_enterprise_id),
    'outlets', coalesce((select jsonb_agg(to_jsonb(o) order by o.outlet_name) from public.enterprise_outlets o where o.enterprise_id=p_enterprise_id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.enterprise_members m where m.enterprise_id=p_enterprise_id), '[]'::jsonb),
    'catalog', coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.enterprise_menu_catalog c where c.enterprise_id=p_enterprise_id and c.active), '[]'::jsonb),
    'transfers', coalesce((select jsonb_agg(to_jsonb(t) order by t.requested_at desc) from public.enterprise_inventory_transfers t where t.enterprise_id=p_enterprise_id and t.status <> 'cancelled' limit 50), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.enterprise_devices d where d.enterprise_id=p_enterprise_id), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.phase7_enterprise_summary(uuid) from public;
grant execute on function public.phase7_enterprise_summary(uuid) to authenticated, service_role;

comment on table public.enterprise_groups is 'Anaira Phase 7 enterprise/group control plane; non-destructive overlay on existing restaurants.';
