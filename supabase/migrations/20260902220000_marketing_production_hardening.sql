-- Anaira Marketing Hub production hardening. Apply after 20260902150000_marketing_hub.sql.
-- Adds retry/idempotency and automatic POS revenue attribution without changing existing business rules.
alter table public.marketing_posts add column if not exists retry_count integer not null default 0;
alter table public.marketing_posts add column if not exists max_retries integer not null default 3;
alter table public.marketing_posts add column if not exists next_retry_at timestamptz;
alter table public.marketing_posts add column if not exists last_attempt_at timestamptz;
alter table public.marketing_posts add column if not exists idempotency_key text;
create unique index if not exists marketing_posts_idempotency_idx on public.marketing_posts(idempotency_key) where idempotency_key is not null;

alter table public.orders add column if not exists marketing_source text;
alter table public.orders add column if not exists marketing_campaign text;
alter table public.orders add column if not exists marketing_medium text;
alter table public.orders add column if not exists marketing_content text;

alter table public.marketing_attribution add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null;
create index if not exists marketing_attr_campaign_idx on public.marketing_attribution(restaurant_id,campaign_id,created_at desc);

create or replace function public.sync_marketing_attribution_from_order() returns trigger language plpgsql security definer set search_path=public as $$
declare v_revenue numeric(12,2); v_campaign_id uuid; v_existing uuid;
begin
  if coalesce(new.marketing_source,'') = '' and coalesce(new.marketing_campaign,'') = '' then return new; end if;
  v_revenue := greatest(coalesce(new.total_amount,0),0);
  v_campaign_id := null;
  if coalesce(new.marketing_campaign,'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    begin select id into v_campaign_id from public.marketing_campaigns where id = new.marketing_campaign::uuid and restaurant_id = new.restaurant_id; exception when others then v_campaign_id := null; end;
  end if;
  select id into v_existing from public.marketing_attribution where restaurant_id=new.restaurant_id and external_order_id=new.id order by created_at desc limit 1;
  if v_existing is null then
    insert into public.marketing_attribution(restaurant_id,source,campaign,medium,content,external_order_id,campaign_id,revenue) values(new.restaurant_id,coalesce(new.marketing_source,'unknown'),nullif(new.marketing_campaign,''),nullif(new.marketing_medium,''),nullif(new.marketing_content,''),new.id,v_campaign_id,case when lower(coalesce(new.status,'')) in ('done','completed','served','paid','delivered') then v_revenue else 0 end);
  else
    update public.marketing_attribution set source=coalesce(new.marketing_source,source),campaign=coalesce(nullif(new.marketing_campaign,''),campaign),medium=coalesce(nullif(new.marketing_medium,''),medium),content=coalesce(nullif(new.marketing_content,''),content),campaign_id=coalesce(v_campaign_id,campaign_id),revenue=case when lower(coalesce(new.status,'')) in ('done','completed','served','paid','delivered') then v_revenue else revenue end where id=v_existing;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_marketing_attribution_from_order on public.orders;
create trigger trg_sync_marketing_attribution_from_order after insert or update of status,total_amount,marketing_source,marketing_campaign,marketing_medium,marketing_content on public.orders for each row execute function public.sync_marketing_attribution_from_order();

-- Backfill attribution for already-tagged orders.
insert into public.marketing_attribution(restaurant_id,source,campaign,medium,content,external_order_id,revenue)
select o.restaurant_id,coalesce(o.marketing_source,'unknown'),nullif(o.marketing_campaign,''),nullif(o.marketing_medium,''),nullif(o.marketing_content,''),o.id,case when lower(coalesce(o.status,'')) in ('done','completed','served','paid','delivered') then greatest(coalesce(o.total_amount,0),0) else 0 end
from public.orders o
where (coalesce(o.marketing_source,'')<>'' or coalesce(o.marketing_campaign,'')<>'')
and not exists(select 1 from public.marketing_attribution a where a.restaurant_id=o.restaurant_id and a.external_order_id=o.id);


-- Platform marketing attribution and opted-in audience.
create table if not exists public.platform_marketing_audience (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null,
  email text,
  consent boolean not null default false,
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  source text not null default 'manual',
  campaign_id uuid references public.platform_marketing_campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(phone)
);
alter table public.platform_marketing_audience enable row level security;
DO $$ BEGIN create policy platform_marketing_audience_sa_only on public.platform_marketing_audience for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger trg_platform_marketing_audience_updated before update on public.platform_marketing_audience for each row execute function public.touch_marketing_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists public.platform_marketing_attribution (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.platform_marketing_campaigns(id) on delete set null,
  lead_id uuid references public.platform_marketing_leads(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  subscription_id uuid references public.restaurant_subscriptions(id) on delete set null,
  stage text not null default 'lead',
  revenue numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(subscription_id)
);
alter table public.platform_marketing_attribution enable row level security;
DO $$ BEGIN create policy platform_marketing_attribution_sa_only on public.platform_marketing_attribution for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
create index if not exists platform_marketing_attr_campaign_idx on public.platform_marketing_attribution(campaign_id,created_at desc);

create or replace function public.sync_platform_marketing_subscription() returns trigger language plpgsql security definer set search_path=public as $$
declare v_lead record; v_revenue numeric(14,2);
begin
  if lower(coalesce(new.status,'')) not in ('active','past_due') then return new; end if;
  select l.* into v_lead from public.platform_marketing_leads l where l.restaurant_id=new.restaurant_id order by l.created_at desc limit 1;
  select coalesce(sp.monthly_price,0) into v_revenue from public.saas_plans sp where sp.id=new.plan_id;
  insert into public.platform_marketing_attribution(campaign_id,lead_id,restaurant_id,subscription_id,stage,revenue) values(v_lead.campaign_id,v_lead.id,new.restaurant_id,new.id,case when lower(coalesce(new.status,''))='active' then 'subscribed' else 'past_due' end,v_revenue) on conflict(subscription_id) do update set stage=excluded.stage,revenue=excluded.revenue,campaign_id=coalesce(excluded.campaign_id,platform_marketing_attribution.campaign_id),lead_id=coalesce(excluded.lead_id,platform_marketing_attribution.lead_id);
  return new;
end; $$;
drop trigger if exists trg_platform_marketing_subscription on public.restaurant_subscriptions;
create trigger trg_platform_marketing_subscription after insert or update of status,plan_id on public.restaurant_subscriptions for each row execute function public.sync_platform_marketing_subscription();


alter table public.platform_marketing_posts add column if not exists template_name text;
alter table public.platform_marketing_posts add column if not exists template_language text;
alter table public.platform_marketing_posts add column if not exists retry_count integer not null default 0;
alter table public.platform_marketing_posts add column if not exists max_retries integer not null default 3;
alter table public.platform_marketing_posts add column if not exists next_retry_at timestamptz;
