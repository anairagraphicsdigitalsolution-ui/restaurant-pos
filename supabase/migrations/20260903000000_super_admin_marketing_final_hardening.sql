-- Final Super Admin Marketing hardening. Marketing-only; no POS/Billing/Delivery/KOT/Offers changes.
create table if not exists public.platform_marketing_message_events (
 id uuid primary key default gen_random_uuid(),
 message_id text,
 phone text,
 status text not null,
 error_message text,
 template_name text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists platform_marketing_message_events_status_idx on public.platform_marketing_message_events(status,created_at desc);
create index if not exists platform_marketing_message_events_message_idx on public.platform_marketing_message_events(message_id,created_at desc);
alter table public.platform_marketing_message_events enable row level security;
drop policy if exists platform_marketing_message_events_sa on public.platform_marketing_message_events;
create policy platform_marketing_message_events_sa on public.platform_marketing_message_events for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
alter table public.platform_marketing_campaigns add column if not exists objective_details jsonb not null default '{}'::jsonb;
alter table public.platform_marketing_posts add column if not exists metadata jsonb not null default '{}'::jsonb;
