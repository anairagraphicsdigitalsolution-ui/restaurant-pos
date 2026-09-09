-- Final Marketing production hardening. Apply to Cloud only.
-- Does not modify POS/Billing/Delivery/KOT/Offers.
create table if not exists public.platform_marketing_settings (id uuid primary key default gen_random_uuid(), setting_key text not null unique, config jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.platform_marketing_settings enable row level security;
drop policy if exists platform_marketing_settings_sa on public.platform_marketing_settings;
create policy platform_marketing_settings_sa on public.platform_marketing_settings for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create unique index if not exists whatsapp_messages_wamid_uidx on public.whatsapp_messages(wamid) where wamid is not null;
create unique index if not exists whatsapp_messages_restaurant_idem_uidx on public.whatsapp_messages(restaurant_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists platform_marketing_message_events_idem_uidx on public.platform_marketing_message_events(idempotency_key) where idempotency_key is not null;
create table if not exists public.marketing_dispatch_jobs (id uuid primary key default gen_random_uuid(), scope text not null check(scope in ('restaurant','platform')), post_id uuid, restaurant_id uuid, channel text not null check(channel in ('facebook','instagram','whatsapp')), job_type text not null check(job_type in ('publish','send')), status text not null default 'queued' check(status in ('queued','processing','succeeded','failed','dead')), attempts integer not null default 0, max_attempts integer not null default 5, available_at timestamptz not null default now(), locked_at timestamptz, locked_by text, idempotency_key text not null unique, payload jsonb not null default '{}'::jsonb, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists marketing_dispatch_jobs_due_idx on public.marketing_dispatch_jobs(status,available_at);
create index if not exists marketing_dispatch_jobs_post_idx on public.marketing_dispatch_jobs(post_id);
alter table public.marketing_dispatch_jobs enable row level security;
drop policy if exists marketing_dispatch_jobs_super_admin on public.marketing_dispatch_jobs;
create policy marketing_dispatch_jobs_super_admin on public.marketing_dispatch_jobs for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
