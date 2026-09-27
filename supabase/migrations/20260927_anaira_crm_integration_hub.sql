create extension if not exists pgcrypto;
create table if not exists public.anaira_crm_connections (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
 crm_base_url text,
 crm_api_key text,
 restaurant_api_key_hash text,
 restaurant_api_key_last4 text,
 status text not null default 'disconnected' check(status in ('disconnected','connected','error','paused')),
 capabilities jsonb not null default '{"customer":true,"orders":true,"loyalty":true,"reviews":true,"marketing":true,"segments":true}'::jsonb,
 last_sync_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.anaira_crm_integration_events (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 event_type text not null,
 external_id text,
 payload jsonb not null default '{}'::jsonb,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 processed_at timestamptz,
 unique(restaurant_id,event_type,external_id)
);
create index if not exists idx_anaira_crm_events_due on public.anaira_crm_integration_events(status,next_attempt_at,created_at);
alter table public.anaira_crm_connections enable row level security;
alter table public.anaira_crm_integration_events enable row level security;
drop policy if exists anaira_crm_connections_tenant on public.anaira_crm_connections;
create policy anaira_crm_connections_tenant on public.anaira_crm_connections for all to authenticated using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));
drop policy if exists anaira_crm_events_tenant on public.anaira_crm_integration_events;
create policy anaira_crm_events_tenant on public.anaira_crm_integration_events for all to authenticated using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));
