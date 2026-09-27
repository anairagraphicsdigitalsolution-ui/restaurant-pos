-- Super Admin Marketing production suite: connection lifecycle, CRM, campaigns, audit and attribution.
-- No POS/Billing/Delivery/KOT/Offers/WhatsApp Invoice tables are changed.

alter table public.platform_marketing_connections add column if not exists token_expires_at timestamptz;
alter table public.platform_marketing_connections add column if not exists last_tested_at timestamptz;
alter table public.platform_marketing_connections add column if not exists last_test_status text;
alter table public.platform_marketing_connections add column if not exists last_test_error text;

alter table public.platform_marketing_campaigns add column if not exists channels jsonb not null default '[]'::jsonb;
alter table public.platform_marketing_campaigns add column if not exists audience_type text not null default 'all';
alter table public.platform_marketing_campaigns add column if not exists actual_spend numeric(12,2) not null default 0;

alter table public.platform_marketing_leads add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.platform_marketing_leads add column if not exists last_contacted_at timestamptz;
alter table public.platform_marketing_leads add column if not exists next_followup_at timestamptz;

alter table public.platform_marketing_attribution add column if not exists source text;
alter table public.platform_marketing_attribution add column if not exists medium text;
alter table public.platform_marketing_attribution add column if not exists content text;
alter table public.platform_marketing_attribution add column if not exists click_id text;
alter table public.platform_marketing_attribution add column if not exists session_id text;

create index if not exists platform_marketing_campaigns_status_idx on public.platform_marketing_campaigns(status,start_at,end_at);
create index if not exists platform_marketing_leads_status_created_idx on public.platform_marketing_leads(status,created_at desc);
create index if not exists platform_marketing_leads_campaign_idx on public.platform_marketing_leads(campaign_id,created_at desc);
create index if not exists platform_marketing_leads_followup_idx on public.platform_marketing_leads(next_followup_at) where next_followup_at is not null;
create index if not exists platform_marketing_posts_campaign_idx on public.platform_marketing_posts(campaign_id,created_at desc);
create index if not exists platform_marketing_connections_platform_status_idx on public.platform_marketing_connections(platform,status,updated_at desc);
create index if not exists platform_marketing_attr_lead_idx on public.platform_marketing_attribution(lead_id,created_at desc);
create index if not exists platform_marketing_attr_restaurant_idx on public.platform_marketing_attribution(restaurant_id,created_at desc);

-- Trigger functions are internal-only; they never need public RPC execution.
revoke execute on function public.sync_marketing_attribution_from_order() from anon, authenticated;
revoke execute on function public.sync_platform_marketing_subscription() from anon, authenticated;

-- Fix trigger helper search path where the function exists.
do $$ begin
  alter function public.touch_marketing_updated_at() set search_path=public;
exception when undefined_function then null;
end $$;

create table if not exists public.platform_marketing_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check(scope='platform'),
  platform text not null check(platform in ('facebook','instagram')),
  token_expires_at timestamptz,
  candidates jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);
alter table public.platform_marketing_oauth_sessions enable row level security;
create policy platform_marketing_oauth_sessions_sa on public.platform_marketing_oauth_sessions for all to authenticated using (public.is_super_admin() and user_id=auth.uid()) with check (public.is_super_admin() and user_id=auth.uid());
create index if not exists platform_marketing_oauth_sessions_exp_idx on public.platform_marketing_oauth_sessions(expires_at);
