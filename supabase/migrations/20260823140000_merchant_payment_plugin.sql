-- Merchant Payments & Voice plugin. Super Admin can activate/deactivate per restaurant.
-- The plugin controls access to merchant UPI/payment account configuration and voice payment UX.

insert into public.plugin_catalog(code,name,icon,category,description,kind,active,sort_order)
values (
  'payment-accounts',
  'Merchant Payments & Voice',
  '💳',
  'Payments',
  'Merchant UPI account, payment confirmation, receipt attachment and voice payment announcement.',
  'feature',
  true,
  285
)
on conflict (code) do update set
  name=excluded.name,
  icon=excluded.icon,
  category=excluded.category,
  description=excluded.description,
  kind=excluded.kind,
  active=excluded.active,
  sort_order=excluded.sort_order;

insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config, display_name, category, description, feature_kind
)
select r.id, 'payment-accounts', 'payment-accounts', false, '{}'::jsonb,
       c.name, c.category, c.description, c.kind
from public.restaurants r
join public.plugin_catalog c on c.code='payment-accounts'
where not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id=r.id and rp.plugin_code='payment-accounts'
);

create index if not exists idx_restaurant_plugins_payment_accounts
on public.restaurant_plugins(restaurant_id, enabled)
where plugin_code='payment-accounts';

create or replace function public.is_restaurant_feature_enabled(
  p_restaurant_id uuid,
  p_plugin_code text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_plugins rp
    where rp.restaurant_id=p_restaurant_id
      and rp.enabled=true
      and rp.plugin_code=lower(trim(p_plugin_code))
  );
$$;
