-- Anaira Marketing Hub: tenant-isolated marketing foundation.
-- No existing POS tables/data are modified.

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  objective text default 'awareness',
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  budget numeric(12,2) default 0,
  start_at timestamptz,
  end_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram','whatsapp')),
  account_id text,
  account_name text,
  profile_image_url text,
  status text not null default 'disconnected' check (status in ('connected','disconnected','expired','error')),
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(restaurant_id, platform, account_id)
);

create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram','whatsapp')),
  content_type text not null default 'text' check (content_type in ('text','image','carousel','reel','whatsapp')),
  caption text not null default '',
  media_urls jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','publishing','published','failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_id text,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  source_type text default 'manual',
  source_id uuid,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null default '',
  phone text,
  email text,
  source text not null default 'manual',
  source_campaign text,
  status text not null default 'new' check (status in ('new','contacted','demo','trial','subscribed','lost','converted')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_attribution (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  source text not null,
  campaign text,
  medium text,
  content text,
  external_order_id uuid,
  lead_id uuid references public.marketing_leads(id) on delete set null,
  revenue numeric(12,2) default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  actor_id uuid references auth.users(id),
  scope text not null default 'restaurant',
  action text not null,
  platform text,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  objective text default 'saas-acquisition',
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  budget numeric(12,2) default 0,
  start_at timestamptz,
  end_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_marketing_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text,
  email text,
  source text not null default 'manual',
  campaign_id uuid references public.platform_marketing_campaigns(id) on delete set null,
  status text not null default 'new' check (status in ('new','contacted','demo','trial','subscribed','lost')),
  notes text,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_marketing_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook','instagram','whatsapp')),
  content_type text not null default 'text',
  caption text not null default '',
  media_urls jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','publishing','published','failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_id text,
  campaign_id uuid references public.platform_marketing_campaigns(id) on delete set null,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_posts_restaurant_status_idx on public.marketing_posts(restaurant_id,status,scheduled_at);
create index if not exists marketing_leads_restaurant_status_idx on public.marketing_leads(restaurant_id,status,created_at desc);
create index if not exists marketing_attr_restaurant_created_idx on public.marketing_attribution(restaurant_id,created_at desc);

alter table public.marketing_campaigns enable row level security;
alter table public.marketing_connections enable row level security;
alter table public.marketing_posts enable row level security;
alter table public.marketing_leads enable row level security;
alter table public.marketing_attribution enable row level security;
alter table public.marketing_audit_logs enable row level security;
alter table public.platform_marketing_campaigns enable row level security;
alter table public.platform_marketing_leads enable row level security;
alter table public.platform_marketing_posts enable row level security;

DO $$ BEGIN
  create policy marketing_campaigns_access on public.marketing_campaigns for all to authenticated using (public.is_super_admin() or restaurant_id = public.current_restaurant_id()) with check (public.is_super_admin() or restaurant_id = public.current_restaurant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy marketing_connections_access on public.marketing_connections for all to authenticated using (public.is_super_admin() or restaurant_id = public.current_restaurant_id()) with check (public.is_super_admin() or restaurant_id = public.current_restaurant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy marketing_posts_access on public.marketing_posts for all to authenticated using (public.is_super_admin() or restaurant_id = public.current_restaurant_id()) with check (public.is_super_admin() or restaurant_id = public.current_restaurant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy marketing_leads_access on public.marketing_leads for all to authenticated using (public.is_super_admin() or restaurant_id = public.current_restaurant_id()) with check (public.is_super_admin() or restaurant_id = public.current_restaurant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy marketing_attribution_access on public.marketing_attribution for all to authenticated using (public.is_super_admin() or restaurant_id = public.current_restaurant_id()) with check (public.is_super_admin() or restaurant_id = public.current_restaurant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy marketing_audit_access on public.marketing_audit_logs for all to authenticated using (public.is_super_admin() or restaurant_id = public.current_restaurant_id()) with check (public.is_super_admin() or restaurant_id = public.current_restaurant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy platform_marketing_campaigns_sa_only on public.platform_marketing_campaigns for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy platform_marketing_leads_sa_only on public.platform_marketing_leads for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy platform_marketing_posts_sa_only on public.platform_marketing_posts for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Updated-at helpers without changing existing tables.
create or replace function public.touch_marketing_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
DO $$ BEGIN create trigger trg_marketing_campaigns_updated before update on public.marketing_campaigns for each row execute function public.touch_marketing_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger trg_marketing_connections_updated before update on public.marketing_connections for each row execute function public.touch_marketing_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger trg_marketing_posts_updated before update on public.marketing_posts for each row execute function public.touch_marketing_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger trg_marketing_leads_updated before update on public.marketing_leads for each row execute function public.touch_marketing_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger trg_platform_campaigns_updated before update on public.platform_marketing_campaigns for each row execute function public.touch_marketing_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger trg_platform_leads_updated before update on public.platform_marketing_leads for each row execute function public.touch_marketing_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger trg_platform_posts_updated before update on public.platform_marketing_posts for each row execute function public.touch_marketing_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Production marketing fields added without touching POS tables.
alter table public.marketing_posts add column if not exists hashtags text[] not null default '{}';
alter table public.marketing_posts add column if not exists location text;
alter table public.marketing_posts add column if not exists cta_type text;
alter table public.marketing_posts add column if not exists cta_url text;
alter table public.marketing_posts add column if not exists video_url text;
alter table public.marketing_posts add column if not exists template_name text;
alter table public.marketing_posts add column if not exists template_language text;
alter table public.marketing_posts add column if not exists consent_required boolean not null default true;

alter table public.marketing_connections add column if not exists encrypted_access_token text;
alter table public.marketing_connections add column if not exists token_expires_at timestamptz;
alter table public.marketing_connections add column if not exists selected_parent_id text;

create table if not exists public.marketing_audience_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid,
  lead_id uuid references public.marketing_leads(id) on delete set null,
  channel text not null check(channel in ('whatsapp','facebook','instagram','email')),
  address text not null,
  consent boolean not null default false,
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id,channel,address)
);
alter table public.marketing_audience_members enable row level security;
DO $$ BEGIN
  create policy marketing_audience_access on public.marketing_audience_members for all to authenticated using (public.is_super_admin() or restaurant_id = public.current_restaurant_id()) with check (public.is_super_admin() or restaurant_id = public.current_restaurant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create trigger trg_marketing_audience_updated before update on public.marketing_audience_members for each row execute function public.touch_marketing_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
create index if not exists marketing_audience_lookup_idx on public.marketing_audience_members(restaurant_id,channel,consent,unsubscribed_at);

-- The marketing plugin is independent from transactional WhatsApp.
insert into public.restaurant_plugins (restaurant_id,plugin_code,enabled)
select r.id,'whatsapp-marketing',false from public.restaurants r
where not exists (select 1 from public.restaurant_plugins p where p.restaurant_id=r.id and p.plugin_code='whatsapp-marketing');

-- Publicly readable creative assets; uploads remain tenant-scoped by object path.
insert into storage.buckets (id,name,public) values ('marketing-media','marketing-media',true) on conflict (id) do update set public=true;
DO $$ BEGIN
  create policy marketing_media_read on storage.objects for select to public using (bucket_id='marketing-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy marketing_media_insert on storage.objects for insert to authenticated with check (bucket_id='marketing-media' and split_part(name,'/',1)=public.current_restaurant_id()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy marketing_media_update on storage.objects for update to authenticated using (bucket_id='marketing-media' and split_part(name,'/',1)=public.current_restaurant_id()::text) with check (bucket_id='marketing-media' and split_part(name,'/',1)=public.current_restaurant_id()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create policy marketing_media_delete on storage.objects for delete to authenticated using (bucket_id='marketing-media' and split_part(name,'/',1)=public.current_restaurant_id()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists public.platform_marketing_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null check(platform in ('facebook','instagram','whatsapp')),
  account_id text not null,
  account_name text,
  profile_image_url text,
  encrypted_access_token text,
  status text not null default 'connected' check(status in ('connected','disconnected','expired','error')),
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(platform,account_id)
);
alter table public.platform_marketing_connections enable row level security;
DO $$ BEGIN create policy platform_marketing_connections_sa_only on public.platform_marketing_connections for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger trg_platform_marketing_connections_updated before update on public.platform_marketing_connections for each row execute function public.touch_marketing_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
