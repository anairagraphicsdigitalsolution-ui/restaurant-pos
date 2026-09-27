-- Anaira Restaurant SaaS <-> CRM: full Integration Hub control plane.
create extension if not exists pgcrypto;

alter table public.anaira_crm_connections
  add column if not exists enabled boolean not null default true,
  add column if not exists sync_mode text not null default 'event_driven',
  add column if not exists retry_enabled boolean not null default true,
  add column if not exists max_retry_attempts integer not null default 8,
  add column if not exists retry_backoff_seconds integer not null default 30,
  add column if not exists dead_letter_enabled boolean not null default true,
  add column if not exists webhook_enabled boolean not null default true,
  add column if not exists event_enabled boolean not null default true,
  add column if not exists field_mapping jsonb not null default '{}'::jsonb,
  add column if not exists event_allowlist jsonb not null default '[]'::jsonb,
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_health_status text,
  add column if not exists last_reconciliation_at timestamptz,
  add column if not exists last_reconciliation_status text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.anaira_crm_integration_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  connection_id uuid not null references public.anaira_crm_connections(id) on delete cascade,
  integration_code text not null default 'anaira-crm',
  policy jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '{"customer":true,"customer360":true,"loyalty":true,"reviews":true,"marketing":true,"segmentation":true,"vip":true,"automation":true}'::jsonb,
  event_allowlist jsonb not null default '[]'::jsonb,
  field_mapping jsonb not null default '{}'::jsonb,
  retry_policy jsonb not null default '{"enabled":true,"max_attempts":8,"backoff_seconds":30,"dead_letter":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id,integration_code)
);

create table if not exists public.anaira_crm_webhook_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  connection_id uuid references public.anaira_crm_connections(id) on delete set null,
  event_id text not null,
  event_type text not null,
  business_id uuid,
  restaurant_id_external uuid,
  entity_id text,
  payload_version text not null default '1.0',
  idempotency_key text,
  source text not null default 'crm',
  destination text not null default 'restaurant_saas',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check(status in ('received','processing','processed','failed','dead_letter')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(event_id)
);
create index if not exists anaira_crm_webhook_due_idx on public.anaira_crm_webhook_events(status,next_attempt_at);

create table if not exists public.anaira_crm_integration_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  connection_id uuid references public.anaira_crm_connections(id) on delete set null,
  action text not null,
  severity text not null default 'info' check(severity in ('debug','info','warning','error','critical')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists anaira_crm_integration_logs_idx on public.anaira_crm_integration_logs(restaurant_id,created_at desc);

create table if not exists public.anaira_crm_reconciliation (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  connection_id uuid references public.anaira_crm_connections(id) on delete set null,
  scope text not null,
  status text not null default 'pending' check(status in ('pending','running','matched','mismatch','failed')),
  source_count integer not null default 0,
  destination_count integer not null default 0,
  mismatch_count integer not null default 0,
  mismatches jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);
create index if not exists anaira_crm_reconciliation_idx on public.anaira_crm_reconciliation(restaurant_id,started_at desc);

create table if not exists public.anaira_crm_field_mappings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  connection_id uuid not null references public.anaira_crm_connections(id) on delete cascade,
  entity_type text not null,
  source_field text not null,
  destination_field text not null,
  transform text,
  enabled boolean not null default true,
  unique(connection_id,entity_type,source_field,destination_field)
);

alter table public.anaira_crm_integration_settings enable row level security;
alter table public.anaira_crm_webhook_events enable row level security;
alter table public.anaira_crm_integration_logs enable row level security;
alter table public.anaira_crm_reconciliation enable row level security;
alter table public.anaira_crm_field_mappings enable row level security;

create policy anaira_crm_integration_settings_access on public.anaira_crm_integration_settings for all to authenticated using((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid())) with check((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()));
create policy anaira_crm_webhook_events_access on public.anaira_crm_webhook_events for all to authenticated using((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid())) with check((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()));
create policy anaira_crm_integration_logs_access on public.anaira_crm_integration_logs for all to authenticated using((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid())) with check((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()));
create policy anaira_crm_reconciliation_access on public.anaira_crm_reconciliation for all to authenticated using((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid())) with check((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()));
create policy anaira_crm_field_mappings_access on public.anaira_crm_field_mappings for all to authenticated using((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid())) with check((select role from public.profiles where id=auth.uid())='super_admin' or restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()));
