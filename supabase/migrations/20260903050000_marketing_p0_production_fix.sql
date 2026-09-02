-- Anaira Marketing P0 production hardening.
-- Marketing-only. No POS/Billing/Delivery/KOT/Offers changes.

-- The legacy operations suite created marketing_campaigns first with a smaller schema.
-- CREATE TABLE IF NOT EXISTS cannot add the newer Marketing Hub fields, so reconcile
-- the live table without deleting or rewriting existing campaign data.
alter table public.marketing_campaigns add column if not exists objective text default 'awareness';
alter table public.marketing_campaigns add column if not exists budget numeric(12,2) not null default 0;
alter table public.marketing_campaigns add column if not exists start_at timestamptz;
alter table public.marketing_campaigns add column if not exists end_at timestamptz;
alter table public.marketing_campaigns add column if not exists updated_at timestamptz not null default now();
alter table public.marketing_campaigns add column if not exists created_by uuid references auth.users(id);
create index if not exists marketing_campaigns_restaurant_status_idx on public.marketing_campaigns(restaurant_id,status,created_at desc);

drop trigger if exists trg_marketing_campaigns_updated on public.marketing_campaigns;
create trigger trg_marketing_campaigns_updated before update on public.marketing_campaigns for each row execute function public.touch_marketing_updated_at();

-- Keep status values compatible with the Marketing Hub API.
do $$ begin
  alter table public.marketing_campaigns drop constraint if exists marketing_campaigns_status_check;
  alter table public.marketing_campaigns add constraint marketing_campaigns_status_check check (status in ('draft','active','paused','completed'));
exception when duplicate_object then null; end $$;

-- Support deterministic order attribution to an existing marketing lead when the
-- POS customer is linked to an audience member. This avoids assigning revenue to
-- an arbitrary/latest lead.
alter table public.marketing_attribution add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null;
create index if not exists marketing_attribution_lead_idx on public.marketing_attribution(restaurant_id,lead_id,created_at desc);

create or replace function public.sync_marketing_attribution_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revenue numeric(12,2);
  v_campaign_id uuid;
  v_lead_id uuid;
  v_existing uuid;
begin
  if coalesce(new.marketing_source,'') = '' and coalesce(new.marketing_campaign,'') = '' then return new; end if;
  v_revenue := greatest(coalesce(new.total_amount,0),0);

  if coalesce(new.marketing_campaign,'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    begin
      select id into v_campaign_id
      from public.marketing_campaigns
      where id = new.marketing_campaign::uuid and restaurant_id = new.restaurant_id;
    exception when others then
      v_campaign_id := null;
    end;
  end if;

  if new.customer_id is not null then
    select lead_id into v_lead_id
    from public.marketing_audience_members
    where restaurant_id = new.restaurant_id
      and customer_id = new.customer_id
      and lead_id is not null
      and consent = true
      and unsubscribed_at is null
    order by updated_at desc
    limit 1;
  end if;

  select id into v_existing
  from public.marketing_attribution
  where restaurant_id = new.restaurant_id and external_order_id = new.id
  order by created_at desc limit 1;

  if v_existing is null then
    insert into public.marketing_attribution(
      restaurant_id,source,campaign,medium,content,external_order_id,lead_id,campaign_id,revenue
    ) values(
      new.restaurant_id,
      coalesce(new.marketing_source,'unknown'),
      nullif(new.marketing_campaign,''),
      nullif(new.marketing_medium,''),
      nullif(new.marketing_content,''),
      new.id,
      v_lead_id,
      v_campaign_id,
      case when lower(coalesce(new.status,'')) in ('done','completed','served','paid','delivered') then v_revenue else 0 end
    );
  else
    update public.marketing_attribution
    set source=coalesce(new.marketing_source,source),
        campaign=coalesce(nullif(new.marketing_campaign,''),campaign),
        medium=coalesce(nullif(new.marketing_medium,''),medium),
        content=coalesce(nullif(new.marketing_content,''),content),
        lead_id=coalesce(v_lead_id,lead_id),
        campaign_id=coalesce(v_campaign_id,campaign_id),
        revenue=case when lower(coalesce(new.status,'')) in ('done','completed','served','paid','delivered') then v_revenue else revenue end
    where id=v_existing;
  end if;
  return new;
end;
$$;

-- Harden Meta setup UX: OAuth must not start unless both server-side credentials exist.
-- Secrets never enter the browser.
