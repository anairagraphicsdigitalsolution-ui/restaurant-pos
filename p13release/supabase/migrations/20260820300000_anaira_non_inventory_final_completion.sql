-- Final non-inventory operations completion.
-- Inventory tables and inventory logic are intentionally untouched.

create table if not exists public.restaurant_terminals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  terminal_name text not null,
  device_type text not null default 'pos',
  terminal_code text,
  active boolean not null default true,
  offline_enabled boolean not null default true,
  printer_enabled boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique(restaurant_id, terminal_name)
);

create table if not exists public.restaurant_channels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  channel_code text not null,
  display_name text not null,
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, channel_code)
);

create table if not exists public.restaurant_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  display_name text not null,
  merchant_reference text,
  active boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, provider, display_name)
);

create table if not exists public.restaurant_integrations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  integration_type text not null,
  provider text not null,
  display_name text not null,
  active boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, integration_type, provider)
);

create table if not exists public.restaurant_website_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  slug text,
  domain text,
  enabled boolean not null default false,
  seo_title text,
  seo_description text,
  whatsapp_number text,
  theme jsonb not null default '{}'::jsonb,
  sections jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id)
);

create table if not exists public.restaurant_virtual_brands (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  code text not null,
  active boolean not null default true,
  menu_config jsonb not null default '{}'::jsonb,
  channel_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, code)
);

create table if not exists public.restaurant_offline_queue (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  terminal_id uuid references public.restaurant_terminals(id) on delete set null,
  operation_type text not null,
  local_reference text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  synced_at timestamptz
);

create table if not exists public.restaurant_staff_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  shift_date date not null default current_date,
  start_at timestamptz,
  end_at timestamptz,
  break_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  status text not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_approval_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  request_type text not null,
  reference_id uuid,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending',
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.restaurant_menu_publications (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  channel_code text not null,
  version integer not null default 1,
  status text not null default 'draft',
  published_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_terminals_restaurant on public.restaurant_terminals(restaurant_id, active);
create index if not exists idx_channels_restaurant on public.restaurant_channels(restaurant_id, active);
create index if not exists idx_payment_accounts_restaurant on public.restaurant_payment_accounts(restaurant_id, active);
create index if not exists idx_integrations_restaurant on public.restaurant_integrations(restaurant_id, active);
create index if not exists idx_virtual_brands_restaurant on public.restaurant_virtual_brands(restaurant_id, active);
create index if not exists idx_offline_queue_restaurant on public.restaurant_offline_queue(restaurant_id, status, queued_at);
create index if not exists idx_staff_shifts_restaurant on public.restaurant_staff_shifts(restaurant_id, shift_date desc);
create index if not exists idx_approvals_restaurant on public.restaurant_approval_requests(restaurant_id, status, created_at desc);
create index if not exists idx_menu_publications_restaurant on public.restaurant_menu_publications(restaurant_id, channel_code, created_at desc);

alter table public.restaurant_terminals enable row level security;
alter table public.restaurant_channels enable row level security;
alter table public.restaurant_payment_accounts enable row level security;
alter table public.restaurant_integrations enable row level security;
alter table public.restaurant_website_settings enable row level security;
alter table public.restaurant_virtual_brands enable row level security;
alter table public.restaurant_offline_queue enable row level security;
alter table public.restaurant_staff_shifts enable row level security;
alter table public.restaurant_approval_requests enable row level security;
alter table public.restaurant_menu_publications enable row level security;

drop policy if exists terminals_scoped_v1 on public.restaurant_terminals;
create policy terminals_scoped_v1 on public.restaurant_terminals for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists channels_scoped_v1 on public.restaurant_channels;
create policy channels_scoped_v1 on public.restaurant_channels for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists payment_accounts_scoped_v1 on public.restaurant_payment_accounts;
create policy payment_accounts_scoped_v1 on public.restaurant_payment_accounts for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists integrations_scoped_v1 on public.restaurant_integrations;
create policy integrations_scoped_v1 on public.restaurant_integrations for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists website_scoped_v1 on public.restaurant_website_settings;
create policy website_scoped_v1 on public.restaurant_website_settings for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists virtual_brands_scoped_v1 on public.restaurant_virtual_brands;
create policy virtual_brands_scoped_v1 on public.restaurant_virtual_brands for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists offline_queue_scoped_v1 on public.restaurant_offline_queue;
create policy offline_queue_scoped_v1 on public.restaurant_offline_queue for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists shifts_scoped_v1 on public.restaurant_staff_shifts;
create policy shifts_scoped_v1 on public.restaurant_staff_shifts for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists approvals_scoped_v1 on public.restaurant_approval_requests;
create policy approvals_scoped_v1 on public.restaurant_approval_requests for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists menu_publications_scoped_v1 on public.restaurant_menu_publications;
create policy menu_publications_scoped_v1 on public.restaurant_menu_publications for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

insert into public.restaurant_channels(restaurant_id,channel_code,display_name)
select r.id, v.code, v.name
from public.restaurants r
cross join (values
  ('pos','POS'),('takeaway','Takeaway'),('delivery','Delivery'),('qr','QR Ordering'),
  ('kiosk','Kiosk'),('website','Website'),('zomato','Zomato'),('swiggy','Swiggy'),
  ('captain','Captain'),('phone','Phone'),('walkin','Walk-in')
) v(code,name)
where not exists (
  select 1 from public.restaurant_channels c
  where c.restaurant_id=r.id and c.channel_code=v.code
);

insert into public.restaurant_integrations(restaurant_id,integration_type,provider,display_name)
select r.id, v.kind, v.provider, v.name
from public.restaurants r
cross join (values
 ('payment','payment-accounts','Payment Accounts'),
 ('accounting','tally','Tally'),
 ('accounting','sap','SAP'),
 ('accounting','dynamics','Microsoft Dynamics'),
 ('messaging','whatsapp','WhatsApp'),
 ('messaging','sms','SMS'),
 ('delivery','zomato','Zomato'),
 ('delivery','swiggy','Swiggy')
) v(kind,provider,name)
where not exists (
 select 1 from public.restaurant_integrations i
 where i.restaurant_id=r.id and i.integration_type=v.kind and i.provider=v.provider
);

insert into public.restaurant_terminals(restaurant_id,terminal_name,device_type,terminal_code)
select r.id,'Main POS','pos','MAIN'
from public.restaurants r
where not exists (
 select 1 from public.restaurant_terminals t
 where t.restaurant_id=r.id and t.terminal_name='Main POS'
);
