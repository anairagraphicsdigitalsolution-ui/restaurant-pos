-- Final runtime alignment for Manual QR / Merchant Payments & Voice.
-- Idempotent: safe to apply even when earlier merchant-payment migrations ran.

insert into public.plugin_catalog(code,name,icon,category,description,kind,active,sort_order)
values (
  'payment-accounts',
  'Merchant Payments & Voice',
  '💳',
  'Payments',
  'Merchant UPI account, manual QR payment, payment claim/UTR and voice payment announcement.',
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
  active=true,
  sort_order=excluded.sort_order;

insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config,
  display_name, category, description, feature_kind
)
select r.id, c.code, c.code, false, '{}'::jsonb,
       c.name, c.category, c.description, c.kind
from public.restaurants r
join public.plugin_catalog c on c.code='payment-accounts'
where not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id=r.id and rp.plugin_code='payment-accounts'
);

create index if not exists idx_restaurant_plugins_payment_accounts_final
on public.restaurant_plugins(restaurant_id, enabled)
where plugin_code='payment-accounts';

create index if not exists idx_notifications_restaurant_created_at_final
on public.notifications(restaurant_id, created_at desc);

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;
