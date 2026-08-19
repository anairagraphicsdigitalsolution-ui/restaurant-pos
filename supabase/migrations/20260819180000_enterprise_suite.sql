-- Anaira POS Enterprise Suite
-- Intentionally does not create, alter, or reference inventory objects.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  message text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_date date not null,
  opening_cash numeric(14,2) not null default 0,
  cash_sales numeric(14,2) not null default 0,
  refunds numeric(14,2) not null default 0,
  expected_cash numeric(14,2) not null default 0,
  actual_cash numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  notes text,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(restaurant_id, business_date)
);

create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  monthly_price numeric(14,2) not null default 0,
  yearly_price numeric(14,2) not null default 0,
  max_users integer,
  max_tables integer,
  qr_ordering boolean not null default true,
  loyalty boolean not null default false,
  offers boolean not null default false,
  analytics boolean not null default false,
  reservations boolean not null default false,
  whatsapp boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  plan_id uuid references public.saas_plans(id) on delete set null,
  status text not null default 'trial' check (status in ('trial','active','past_due','cancelled','expired')),
  trial_ends_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  code text not null,
  uses integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(restaurant_id, code),
  unique(customer_id)
);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  referred_customer_id uuid references public.customers(id) on delete set null,
  referrer_points integer not null default 0,
  referred_points integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_restaurant on public.notifications(restaurant_id, created_at desc);
create index if not exists idx_audit_restaurant on public.audit_logs(restaurant_id, created_at desc);
create index if not exists idx_cash_closing_restaurant on public.cash_closings(restaurant_id, business_date desc);
create index if not exists idx_subscriptions_restaurant on public.restaurant_subscriptions(restaurant_id, status);

alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.cash_closings enable row level security;
alter table public.saas_plans enable row level security;
alter table public.restaurant_subscriptions enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_events enable row level security;

drop policy if exists notifications_scoped on public.notifications;
create policy notifications_scoped on public.notifications for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists audit_scoped on public.audit_logs;
create policy audit_scoped on public.audit_logs for all using (restaurant_id is null or public.is_restaurant_member(restaurant_id)) with check (restaurant_id is null or public.is_restaurant_member(restaurant_id));

drop policy if exists cash_scoped on public.cash_closings;
create policy cash_scoped on public.cash_closings for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists plans_read on public.saas_plans;
create policy plans_read on public.saas_plans for select using (true);

drop policy if exists subscriptions_scoped on public.restaurant_subscriptions;
create policy subscriptions_scoped on public.restaurant_subscriptions for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists referral_codes_scoped on public.referral_codes;
create policy referral_codes_scoped on public.referral_codes for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists referral_events_scoped on public.referral_events;
create policy referral_events_scoped on public.referral_events for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

insert into public.saas_plans (name, monthly_price, yearly_price, max_users, max_tables, qr_ordering, loyalty, offers, analytics, reservations, whatsapp)
values
 ('Starter', 999, 9990, 3, 20, true, false, false, false, false, false),
 ('Professional', 1999, 19990, 10, 100, true, true, true, true, true, true),
 ('Enterprise', 3999, 39990, null, null, true, true, true, true, true, true)
on conflict (name) do nothing;
