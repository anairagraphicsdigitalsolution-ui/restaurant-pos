-- Run after applying migrations to verify subscription activation.
select r.name,r.status,rs.status as subscription_status,sp.name as plan,
       rs.starts_at,rs.ends_at
from public.restaurants r
left join lateral (
  select * from public.restaurant_subscriptions s
  where s.restaurant_id=r.id
  order by s.updated_at desc,s.created_at desc
  limit 1
) rs on true
left join public.saas_plans sp on sp.id=rs.saas_plan_id
order by r.name;
