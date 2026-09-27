-- P2.1 Call Center database foundation.
-- This mirrors the SQL already applied to the connected Supabase project.
-- Apply through the project's migration workflow after review; do not run blindly on a database where these objects already exist.

create table if not exists public.p2_1_call_sessions (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null, caller_phone text, caller_name text,
  agent_id uuid references public.profiles(id) on delete set null, channel text not null default 'phone',
  status text not null default 'open' check (status in ('open','assigned','callback','resolved','missed')),
  subject text, notes text, callback_at timestamptz, delivery_required boolean not null default false,
  delivery_address text, source text not null default 'call_center', idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), assigned_at timestamptz, resolved_at timestamptz,
  unique (restaurant_id,idempotency_key)
);

create table if not exists public.p2_1_call_events (
  id uuid primary key default gen_random_uuid(), call_session_id uuid not null references public.p2_1_call_sessions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  event_type text not null check (event_type in ('created','identified','assigned','callback_scheduled','reordered','delivery_requested','resolved','note')),
  actor_id uuid references public.profiles(id) on delete set null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create index if not exists idx_p2_1_call_sessions_restaurant_status on public.p2_1_call_sessions(restaurant_id,status,created_at desc);
create index if not exists idx_p2_1_call_sessions_customer on public.p2_1_call_sessions(restaurant_id,customer_id,created_at desc);
create index if not exists idx_p2_1_call_events_session on public.p2_1_call_events(call_session_id,created_at desc);

alter table public.p2_1_call_sessions enable row level security;
alter table public.p2_1_call_events enable row level security;

-- Policies/RPCs are managed by the deployment SQL already applied to Supabase.
