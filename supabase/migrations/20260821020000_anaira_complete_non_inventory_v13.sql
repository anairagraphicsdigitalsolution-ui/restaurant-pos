-- Anaira complete non-inventory operations v13.
-- Additive only. No existing order/customer/payment/inventory rows are deleted.

create table if not exists public.restaurant_floor_maps (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  floor_number integer default 1,
  active boolean not null default true,
  width integer default 1200,
  height integer default 800,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_table_layouts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid,
  floor_map_id uuid,
  x numeric(10,2) default 40,
  y numeric(10,2) default 40,
  width numeric(10,2) default 100,
  height numeric(10,2) default 70,
  rotation numeric(10,2) default 0,
  z_index integer default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_cash_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  shift_id uuid,
  movement_type text not null check (movement_type in ('cash_in','cash_out','sale','refund','adjustment')),
  amount numeric(14,2) not null default 0,
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  request_id uuid,
  decision text not null check (decision in ('approved','rejected','cancelled')),
  reason text,
  decided_by uuid,
  decided_at timestamptz not null default now()
);

create table if not exists public.restaurant_menu_versions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  version integer not null default 1,
  name text not null default 'Menu',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.restaurant_integration_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  integration_code text not null,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued','running','success','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.restaurant_aggregator_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  provider text not null,
  outlet_code text,
  active boolean not null default false,
  menu_sync_enabled boolean not null default true,
  order_sync_enabled boolean not null default true,
  settlement_sync_enabled boolean not null default true,
  last_menu_sync_at timestamptz,
  last_order_sync_at timestamptz,
  last_settlement_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

create table if not exists public.restaurant_customer_segments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  code text not null,
  rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, code)
);

create table if not exists public.restaurant_campaign_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  campaign_id uuid,
  segment_id uuid,
  channel text not null default 'whatsapp',
  status text not null default 'draft' check (status in ('draft','queued','running','completed','failed','cancelled')),
  audience_count integer not null default 0,
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.restaurant_report_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  report_id uuid,
  report_type text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  filters jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  file_path text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.restaurant_hardware_devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  device_type text not null check (device_type in ('printer','kds','display','kiosk','calling','cash_drawer','payment_terminal')),
  name text not null,
  location text,
  active boolean not null default true,
  last_seen_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_service_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid,
  call_type text not null default 'waiter',
  status text not null default 'open' check (status in ('open','acknowledged','resolved','cancelled')),
  note text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid
);

create table if not exists public.restaurant_reservation_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  reservation_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_captain_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  staff_id uuid,
  table_id uuid,
  status text not null default 'open' check (status in ('open','ordering','kot_sent','billing','closed','cancelled')),
  offline boolean not null default false,
  started_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.restaurant_kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  kiosk_id uuid,
  status text not null default 'open' check (status in ('open','cart','payment','completed','cancelled','timeout')),
  language_code text default 'en',
  cart jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.restaurant_display_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  device_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_floor_maps_restaurant on public.restaurant_floor_maps(restaurant_id, active);
create index if not exists idx_table_layout_restaurant on public.restaurant_table_layouts(restaurant_id, floor_map_id);
create index if not exists idx_cash_movements_restaurant on public.restaurant_cash_movements(restaurant_id, created_at desc);
create index if not exists idx_approval_decisions_restaurant on public.restaurant_approval_decisions(restaurant_id, decided_at desc);
create index if not exists idx_integration_jobs_restaurant on public.restaurant_integration_jobs(restaurant_id, status, created_at desc);
create index if not exists idx_campaign_runs_restaurant on public.restaurant_campaign_runs(restaurant_id, status, created_at desc);
create index if not exists idx_report_runs_restaurant on public.restaurant_report_runs(restaurant_id, status, created_at desc);
create index if not exists idx_service_calls_restaurant on public.restaurant_service_calls(restaurant_id, status, created_at desc);
create index if not exists idx_captain_sessions_restaurant on public.restaurant_captain_sessions(restaurant_id, status, started_at desc);
create index if not exists idx_kiosk_sessions_restaurant on public.restaurant_kiosk_sessions(restaurant_id, status, created_at desc);

-- Seed only missing aggregator providers; never overwrite credentials/configuration.
insert into public.restaurant_aggregator_accounts (restaurant_id, provider, active)
select r.id, p.provider, false
from public.restaurants r
cross join (values ('zomato'),('swiggy'),('dineout')) p(provider)
where not exists (
  select 1 from public.restaurant_aggregator_accounts a
  where a.restaurant_id = r.id and a.provider = p.provider
);

-- Seed only missing customer segments.
insert into public.restaurant_customer_segments (restaurant_id, name, code, rules)
select r.id, x.name, x.code, x.rules::jsonb
from public.restaurants r
cross join (values
  ('VIP','vip','{"min_spend":25000}'),
  ('Repeat','repeat','{"min_orders":3}'),
  ('Dormant','dormant','{"inactive_days":30}'),
  ('New','new','{"max_orders":1}')
) x(name,code,rules)
where not exists (
  select 1 from public.restaurant_customer_segments s
  where s.restaurant_id = r.id and s.code = x.code
);

-- RLS: all tables are restaurant scoped. Policy is only created after the table exists.
do $$
declare
  t text;
begin
  foreach t in array array[
    'restaurant_floor_maps','restaurant_table_layouts','restaurant_cash_movements',
    'restaurant_approval_decisions','restaurant_menu_versions','restaurant_integration_jobs',
    'restaurant_aggregator_accounts','restaurant_customer_segments','restaurant_campaign_runs',
    'restaurant_report_runs','restaurant_hardware_devices','restaurant_service_calls',
    'restaurant_reservation_events','restaurant_captain_sessions','restaurant_kiosk_sessions',
    'restaurant_display_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'restaurant scoped v13', t);
    execute format(
      'create policy %I on public.%I for all using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())) with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))',
      'restaurant scoped v13', t
    );
  end loop;
end $$;
