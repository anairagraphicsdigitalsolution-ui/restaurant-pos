-- Cashfree Payment Gateway plugin
-- Credentials are stored only in plugin_settings.config and are never exposed to the browser.
insert into public.plugin_catalog(code,name,icon,category,description,kind,active,sort_order)
values (
  'cashfree-payment-gateway',
  'Cashfree Payment Gateway',
  '💳',
  'Payments',
  'Cashfree online payments with hosted checkout, payment status verification and signed webhooks.',
  'integration',
  true,
  286
)
on conflict (code) do update set
  name=excluded.name, icon=excluded.icon, category=excluded.category,
  description=excluded.description, kind=excluded.kind, active=excluded.active,
  sort_order=excluded.sort_order;

insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config,
  display_name, category, description, feature_kind
)
select r.id, 'cashfree-payment-gateway', 'cashfree-payment-gateway', false, '{}'::jsonb,
       c.name, c.category, c.description, c.kind
from public.restaurants r
join public.plugin_catalog c on c.code='cashfree-payment-gateway'
where not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id=r.id and rp.plugin_code='cashfree-payment-gateway'
);

create index if not exists idx_restaurant_plugins_cashfree
on public.restaurant_plugins(restaurant_id, enabled)
where plugin_code='cashfree-payment-gateway';

create table if not exists public.cashfree_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  cashfree_order_id text not null,
  cf_payment_id text,
  payment_session_id text,
  amount numeric(12,2) not null default 0,
  status text not null default 'PENDING',
  payment_group text,
  bank_reference text,
  raw_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cashfree_order_id)
);

alter table public.cashfree_payment_attempts enable row level security;
drop policy if exists cashfree_attempts_member_v1 on public.cashfree_payment_attempts;
create policy cashfree_attempts_member_v1 on public.cashfree_payment_attempts
for select using (public.is_restaurant_member(restaurant_id));

create index if not exists idx_cashfree_attempts_order
on public.cashfree_payment_attempts(restaurant_id, order_id, created_at desc);
