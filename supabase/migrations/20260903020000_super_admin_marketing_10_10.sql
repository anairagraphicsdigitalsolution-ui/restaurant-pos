-- Super Admin Marketing final production completion. Marketing-only.
alter table public.platform_marketing_campaigns add column if not exists landing_url text;
alter table public.platform_marketing_campaigns add column if not exists actual_spend numeric(12,2) not null default 0;
create table if not exists public.platform_marketing_click_events (id uuid primary key default gen_random_uuid(), campaign_id uuid references public.platform_marketing_campaigns(id) on delete set null, source text, medium text, content text, click_id text, session_id text, destination_url text not null, user_agent text, referrer text, created_at timestamptz not null default now());
alter table public.platform_marketing_click_events enable row level security;
drop policy if exists platform_marketing_click_events_sa on public.platform_marketing_click_events;
create policy platform_marketing_click_events_sa on public.platform_marketing_click_events for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create index if not exists platform_marketing_click_events_campaign_idx on public.platform_marketing_click_events(campaign_id,created_at desc);
create index if not exists platform_marketing_click_events_click_idx on public.platform_marketing_click_events(click_id);
create index if not exists platform_marketing_click_events_session_idx on public.platform_marketing_click_events(session_id);
create unique index if not exists platform_marketing_message_events_dedupe_idx on public.platform_marketing_message_events(message_id,status) where message_id is not null;
