-- Gate automatic customer loyalty earning behind the restaurant's Loyalty plugin.
-- Disabling the plugin hides/blocks the billing customer workflow and also stops
-- future automatic point awards without deleting existing customer history.

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
  plugin_on boolean := false;
begin
  if new.customer_id is null then return new; end if;
  if lower(coalesce(new.status,'')) in ('cancelled','canceled') then return new; end if;
  if not (lower(coalesce(new.payment_status,'')) = 'paid' or lower(coalesce(new.status,'')) in ('paid','completed','done','served')) then
    return new;
  end if;

  select exists(
    select 1 from public.restaurant_plugins rp
    where rp.restaurant_id = new.restaurant_id
      and rp.plugin_code in ('loyalty','crm')
      and rp.enabled = true
  ) into plugin_on;
  if not plugin_on then return new; end if;

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
