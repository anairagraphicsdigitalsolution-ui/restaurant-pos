-- Anaira local-first runtime state. Safe and additive.
create table if not exists public.local_sync_state (
  id boolean primary key default true,
  mode text not null default 'local' check (mode in ('local','online','syncing','error')),
  last_online_at timestamptz,
  last_sync_at timestamptz,
  pending_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint local_sync_state_singleton check (id)
);
insert into public.local_sync_state(id) values (true) on conflict (id) do nothing;

create table if not exists public.local_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  operation text not null,
  restaurant_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  synced_at timestamptz,
  status text not null default 'pending' check (status in ('pending','syncing','synced','error')),
  attempts integer not null default 0,
  last_error text
);
create index if not exists idx_local_outbox_pending on public.local_sync_outbox(status,created_at);
