-- Anaira POS Advanced Loyalty Engine
-- Inventory intentionally untouched.

create table if not exists public.loyalty_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  enabled boolean not null default true,
  points_per_rupee numeric(10,4) not null default 0.1000 check (points_per_rupee >= 0),
  min_bill_amount numeric(12,2) not null default 0 check (min_bill_amount >= 0),
  max_points_per_order integer,
  expiry_days integer,
  review_reward_points integer not null default 0 check (review_reward_points >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  min_points integer not null default 0 check (min_points >= 0),
  multiplier numeric(8,3) not null default 1 check (multiplier > 0),
  benefits text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(restaurant_id, name)
);
create index if not exists idx_loyalty_tiers_restaurant on public.loyalty_tiers(restaurant_id, min_points desc);

create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  points_cost integer not null check (points_cost > 0),
  reward_type text not null default 'discount' check (reward_type in ('discount','percent','free_item','coupon')),
  reward_value numeric(12,2) not null default 0 check (reward_value >= 0),
  min_order_amount numeric(12,2) not null default 0 check (min_order_amount >= 0),
  usage_limit integer,
  used_count integer not null default 0 check (used_count >= 0),
  expires_days integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(restaurant_id, name)
);
create index if not exists idx_loyalty_rewards_restaurant on public.loyalty_rewards(restaurant_id, active, points_cost);
create unique index if not exists uq_loyalty_rewards_restaurant_name on public.loyalty_rewards(restaurant_id, name);

create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid not null references public.loyalty_rewards(id) on delete restrict,
  points integer not null check (points > 0),
  status text not null default 'redeemed' check (status in ('redeemed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_loyalty_redemptions_customer on public.loyalty_redemptions(customer_id, created_at desc);

create table if not exists public.loyalty_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  bonus_points integer not null default 0 check (bonus_points >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_loyalty_campaigns_restaurant on public.loyalty_campaigns(restaurant_id, active, starts_at);

create table if not exists public.loyalty_referrals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  referrer_customer_id uuid not null references public.customers(id) on delete cascade,
  referred_customer_id uuid references public.customers(id) on delete set null,
  code text not null,
  status text not null default 'pending' check (status in ('pending','qualified','cancelled')),
  points_awarded integer not null default 0 check (points_awarded >= 0),
  created_at timestamptz not null default now(),
  unique(restaurant_id, code)
);
create index if not exists idx_loyalty_referrals_restaurant on public.loyalty_referrals(restaurant_id, created_at desc);

alter table public.loyalty_settings enable row level security;
alter table public.loyalty_tiers enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_redemptions enable row level security;
alter table public.loyalty_campaigns enable row level security;
alter table public.loyalty_referrals enable row level security;

drop policy if exists loyalty_settings_scoped on public.loyalty_settings;
create policy loyalty_settings_scoped on public.loyalty_settings for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));
drop policy if exists loyalty_tiers_scoped on public.loyalty_tiers;
create policy loyalty_tiers_scoped on public.loyalty_tiers for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));
drop policy if exists loyalty_rewards_scoped on public.loyalty_rewards;
create policy loyalty_rewards_scoped on public.loyalty_rewards for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));
drop policy if exists loyalty_redemptions_scoped on public.loyalty_redemptions;
create policy loyalty_redemptions_scoped on public.loyalty_redemptions for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));
drop policy if exists loyalty_campaigns_scoped on public.loyalty_campaigns;
create policy loyalty_campaigns_scoped on public.loyalty_campaigns for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));
drop policy if exists loyalty_referrals_scoped on public.loyalty_referrals;
create policy loyalty_referrals_scoped on public.loyalty_referrals for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

create or replace function public.seed_default_loyalty_config(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.loyalty_settings(restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  insert into public.loyalty_tiers(restaurant_id,name,min_points,multiplier,benefits,sort_order)
  values
    (p_restaurant_id,'Bronze',0,1,'Base loyalty member',1),
    (p_restaurant_id,'Silver',500,1.10,'10% bonus points',2),
    (p_restaurant_id,'Gold',1500,1.25,'25% bonus points + priority offers',3),
    (p_restaurant_id,'Platinum',5000,1.50,'50% bonus points + premium rewards',4)
  on conflict (restaurant_id,name) do nothing;

  insert into public.loyalty_rewards(restaurant_id,name,description,points_cost,reward_type,reward_value,min_order_amount,active)
  values
    (p_restaurant_id,'₹100 OFF','Redeem 500 points on eligible bills',500,'discount',100,0,true),
    (p_restaurant_id,'10% OFF','Redeem 700 points for a percentage discount',700,'percent',10,0,true),
    (p_restaurant_id,'Free Dessert','Redeem 300 points for a complimentary dessert',300,'free_item',0,0,true)
  on conflict (restaurant_id,name) do nothing;
end;
$$;

grant execute on function public.seed_default_loyalty_config(uuid) to authenticated;

create or replace function public.award_loyalty_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.loyalty_settings%rowtype;
  c public.customers%rowtype;
  base_points integer;
  final_points integer;
  multiplier numeric := 1;
  tier_record record;
begin
  if new.customer_id is null then return new; end if;
  if lower(coalesce(new.status,'')) in ('cancelled','canceled') then return new; end if;
  if not (lower(coalesce(new.payment_status,'')) = 'paid' or lower(coalesce(new.status,'')) in ('paid','completed','done','served')) then
    return new;
  end if;

  perform public.seed_default_loyalty_config(new.restaurant_id);
  select * into s from public.loyalty_settings where restaurant_id = new.restaurant_id;
  if not coalesce(s.enabled,true) then return new; end if;
  if coalesce(new.total_amount,0) < coalesce(s.min_bill_amount,0) then return new; end if;
  if exists(select 1 from public.loyalty_transactions where order_id = new.id and transaction_type = 'earn') then return new; end if;

  select * into c from public.customers where id = new.customer_id and restaurant_id = new.restaurant_id for update;
  if not found then return new; end if;

  base_points := floor(greatest(coalesce(new.total_amount,0),0) * coalesce(s.points_per_rupee,0))::integer;
  select multiplier into tier_record from public.loyalty_tiers
   where restaurant_id = new.restaurant_id and active = true and min_points <= coalesce(c.loyalty_points,0)
   order by min_points desc limit 1;
  multiplier := coalesce(tier_record.multiplier,1);
  final_points := floor(base_points * multiplier)::integer;
  if s.max_points_per_order is not null then final_points := least(final_points, s.max_points_per_order); end if;
  if final_points <= 0 then return new; end if;

  update public.customers
    set loyalty_points = loyalty_points + final_points,
        total_orders = total_orders + 1,
        total_spend = total_spend + coalesce(new.total_amount,0),
        last_visit_at = coalesce(new.created_at, now()),
        updated_at = now()
  where id = c.id;

  insert into public.loyalty_transactions(restaurant_id,customer_id,order_id,points,transaction_type,note)
  values(new.restaurant_id,new.customer_id,new.id,final_points,'earn','Automatic order reward');

  return new;
end;
$$;

drop trigger if exists trg_award_loyalty_for_order on public.orders;
create trigger trg_award_loyalty_for_order
after insert or update of status,payment_status,total_amount,customer_id on public.orders
for each row execute function public.award_loyalty_for_order();

