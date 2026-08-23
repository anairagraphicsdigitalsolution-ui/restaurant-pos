-- Merchant payment settings: Super Admin controlled UPI configuration.
-- Idempotent and safe to run after the existing merchant payment plugin migration.

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

create table if not exists public.restaurant_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  display_name text not null,
  merchant_reference text,
  active boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, provider, display_name)
);

alter table public.restaurant_payment_accounts enable row level security;

drop policy if exists payment_accounts_scoped_v1 on public.restaurant_payment_accounts;
create policy payment_accounts_scoped_v1
on public.restaurant_payment_accounts
for all
using (public.is_restaurant_member(restaurant_id))
with check (public.is_restaurant_member(restaurant_id));

create index if not exists idx_payment_accounts_restaurant_active
on public.restaurant_payment_accounts(restaurant_id, active);

insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config,
  display_name, category, description, feature_kind
)
select r.id, 'payment-accounts', 'payment-accounts', false, '{}'::jsonb,
       c.name, c.category, c.description, c.kind
from public.restaurants r
join public.plugin_catalog c on c.code='payment-accounts'
where not exists (
  select 1
  from public.restaurant_plugins rp
  where rp.restaurant_id=r.id
    and rp.plugin_code='payment-accounts'
);
