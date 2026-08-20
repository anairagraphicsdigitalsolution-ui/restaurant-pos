-- Anaira Petpooja-style parity completion.
-- NON-DESTRUCTIVE: creates additive tables/functions/indexes only.
-- No existing business rows are deleted or rewritten.

create table if not exists public.pos_terminals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  terminal_code text not null,
  terminal_name text not null,
  device_type text not null default 'pos',
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique(restaurant_id, terminal_code)
);

create table if not exists public.order_holds (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid,
  hold_number text,
  customer_name text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'held',
  created_by uuid,
  created_at timestamptz not null default now(),
  resumed_at timestamptz
);

create table if not exists public.delivery_settlements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  rider_id uuid,
  rider_name text,
  settlement_date date not null default current_date,
  expected_cash numeric not null default 0,
  expected_upi numeric not null default 0,
  expected_card numeric not null default 0,
  submitted_cash numeric not null default 0,
  submitted_upi numeric not null default 0,
  submitted_card numeric not null default 0,
  difference numeric not null default 0,
  status text not null default 'pending',
  notes text,
  created_by uuid,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.aggregator_menu_controls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  channel_code text not null,
  menu_item_id uuid not null,
  external_item_id text,
  available boolean not null default true,
  external_price numeric,
  sync_status text not null default 'pending',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique(restaurant_id, channel_code, menu_item_id)
);

create table if not exists public.aggregator_payouts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  channel_code text not null,
  payout_reference text,
  payout_date date not null default current_date,
  gross_sales numeric not null default 0,
  commission numeric not null default 0,
  platform_charges numeric not null default 0,
  taxes numeric not null default 0,
  cancellations numeric not null default 0,
  net_payout numeric not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.customer_wallets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  customer_id uuid not null,
  balance numeric not null default 0,
  points numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique(restaurant_id, customer_id)
);

create table if not exists public.customer_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  customer_id uuid not null,
  wallet_id uuid,
  transaction_type text not null,
  amount numeric not null default 0,
  points numeric not null default 0,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.reservation_reminders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  reservation_id uuid not null,
  channel text not null default 'whatsapp',
  scheduled_at timestamptz,
  status text not null default 'pending',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  report_type text not null,
  filters jsonb not null default '{}'::jsonb,
  format text not null default 'csv',
  status text not null default 'requested',
  requested_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.digital_display_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  token_no text,
  display_name text,
  message text,
  status text not null default 'queued',
  called_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_settlements_restaurant_date
  on public.delivery_settlements(restaurant_id, settlement_date desc);
create index if not exists idx_aggregator_payouts_restaurant_date
  on public.aggregator_payouts(restaurant_id, payout_date desc);
create index if not exists idx_wallet_transactions_customer
  on public.customer_wallet_transactions(restaurant_id, customer_id, created_at desc);
create index if not exists idx_report_exports_restaurant
  on public.report_exports(restaurant_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array[
    'pos_terminals','order_holds','delivery_settlements',
    'aggregator_menu_controls','aggregator_payouts','customer_wallets',
    'customer_wallet_transactions','reservation_reminders',
    'report_exports','digital_display_calls'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'restaurant scoped '||t, t);
    execute format(
      'create policy %I on public.%I for all using (restaurant_id = (select restaurant_id from public.profiles where id=auth.uid())) with check (restaurant_id = (select restaurant_id from public.profiles where id=auth.uid()))',
      'restaurant scoped '||t, t
    );
  end loop;
end $$;

create or replace function public.calculate_delivery_settlement_difference(
  p_expected_cash numeric,
  p_expected_upi numeric,
  p_expected_card numeric,
  p_submitted_cash numeric,
  p_submitted_upi numeric,
  p_submitted_card numeric
) returns numeric
language sql immutable
as $$
  select round(
    coalesce(p_submitted_cash,0) + coalesce(p_submitted_upi,0) + coalesce(p_submitted_card,0)
    - coalesce(p_expected_cash,0) - coalesce(p_expected_upi,0) - coalesce(p_expected_card,0), 2
  );
$$;

create or replace function public.ensure_customer_wallet(
  p_restaurant_id uuid,
  p_customer_id uuid
) returns public.customer_wallets
language plpgsql security definer set search_path=public
as $$
declare v public.customer_wallets%rowtype;
begin
  insert into public.customer_wallets(restaurant_id, customer_id)
  values(p_restaurant_id,p_customer_id)
  on conflict(restaurant_id,customer_id) do nothing;
  select * into v from public.customer_wallets
  where restaurant_id=p_restaurant_id and customer_id=p_customer_id;
  return v;
end;
$$;
