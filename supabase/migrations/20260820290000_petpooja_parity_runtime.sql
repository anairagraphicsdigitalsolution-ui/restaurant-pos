-- Petpooja-style non-inventory runtime completion.
-- Additive only. Inventory tables and inventory logic are intentionally untouched.

create table if not exists public.reservation_waitlist (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_name text not null,
  phone text,
  guests integer not null default 1,
  preferred_date date,
  preferred_time time,
  notes text,
  status text not null default 'waiting',
  called_at timestamptz,
  seated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reservation_deposits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  payment_method text not null default 'upi',
  reference text,
  status text not null default 'pending',
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reservation_reminders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  channel text not null default 'whatsapp',
  scheduled_for timestamptz not null,
  status text not null default 'queued',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  token_no text not null,
  token_type text not null default 'pickup',
  display_name text,
  status text not null default 'waiting',
  called_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(restaurant_id,token_no)
);

create table if not exists public.kds_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  station_id uuid references public.kitchen_stations(id) on delete set null,
  status text not null,
  priority text not null default 'normal',
  due_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.calling_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid,
  customer_name text,
  request_type text not null default 'waiter',
  message text,
  status text not null default 'queued',
  called_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.aggregator_integrations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  outlet_code text,
  active boolean not null default false,
  credentials jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique(restaurant_id,provider)
);

create table if not exists public.aggregator_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  integration_id uuid references public.aggregator_integrations(id) on delete set null,
  provider text not null,
  external_order_id text not null,
  order_id uuid references public.orders(id) on delete set null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  commission numeric(12,2) not null default 0,
  platform_discount numeric(12,2) not null default 0,
  net_payout numeric(12,2) not null default 0,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id,provider,external_order_id)
);

create table if not exists public.aggregator_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  job_type text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.aggregator_settlements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  payout_reference text,
  gross_amount numeric(12,2) not null default 0,
  commission numeric(12,2) not null default 0,
  discounts numeric(12,2) not null default 0,
  cancellations numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  status text not null default 'pending',
  payout_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  terminal_id uuid,
  cashier_id uuid,
  opening_cash numeric(12,2) not null default 0,
  expected_cash numeric(12,2) not null default 0,
  actual_cash numeric(12,2),
  difference numeric(12,2),
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  shift_id uuid not null references public.cash_shifts(id) on delete cascade,
  movement_type text not null,
  amount numeric(12,2) not null default 0,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  source text not null default 'pos',
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_segments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  code text not null,
  rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(restaurant_id,code)
);

create table if not exists public.customer_segment_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  segment_id uuid not null references public.customer_segments(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  score numeric(12,2),
  joined_at timestamptz not null default now(),
  unique(segment_id,customer_id)
);

create table if not exists public.message_queue (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null,
  purpose text not null,
  recipient text,
  template text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  provider_message_id text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  report_code text not null,
  schedule text not null,
  channel text not null default 'email',
  recipient text,
  filters jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  printer_id uuid,
  job_type text not null,
  reference_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  printed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique(provider,event_id)
);

create index if not exists idx_waitlist_restaurant on public.reservation_waitlist(restaurant_id,status,created_at);
create index if not exists idx_tokens_restaurant on public.order_tokens(restaurant_id,status,created_at desc);
create index if not exists idx_kds_events_restaurant on public.kds_events(restaurant_id,status,created_at desc);
create index if not exists idx_calling_requests_restaurant on public.calling_requests(restaurant_id,status,created_at desc);
create index if not exists idx_aggregator_orders_restaurant on public.aggregator_orders(restaurant_id,provider,received_at desc);
create index if not exists idx_cash_shifts_restaurant on public.cash_shifts(restaurant_id,status,opened_at desc);
create index if not exists idx_order_status_history_order on public.order_status_history(order_id,created_at desc);
create index if not exists idx_message_queue_restaurant on public.message_queue(restaurant_id,status,created_at);
create index if not exists idx_print_jobs_restaurant on public.print_jobs(restaurant_id,status,created_at);

-- Keep RLS scoped to the signed-in restaurant. Only tables that have restaurant_id are touched.
do $$
declare t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema='public'
      and c.column_name='restaurant_id'
      and c.table_name in (
        'reservation_waitlist','reservation_deposits','reservation_reminders','order_tokens',
        'kds_events','calling_requests','aggregator_integrations','aggregator_orders',
        'aggregator_sync_jobs','aggregator_settlements','cash_shifts','cash_movements',
        'order_status_history','customer_segments','customer_segment_members','message_queue',
        'report_schedules','print_jobs','payment_webhook_events'
      )
  loop
    execute format('alter table public.%I enable row level security',t.table_name);
    execute format('drop policy if exists %I on public.%I','restaurant parity scoped '||t.table_name,t.table_name);
    execute format('create policy %I on public.%I for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id))','restaurant parity scoped '||t.table_name,t.table_name);
  end loop;
end $$;

-- Useful status helpers for runtime workflows.
create or replace function public.issue_order_token(p_restaurant_id uuid,p_order_id uuid,p_token_type text default 'pickup',p_display_name text default null)
returns public.order_tokens
language plpgsql security definer set search_path=public as $$
declare v public.order_tokens%rowtype; n integer;
begin
  if not public.is_restaurant_member(p_restaurant_id) then raise exception 'Not authorized'; end if;
  select coalesce(max(nullif(regexp_replace(token_no,'[^0-9]','','g'),'')::integer),0)+1 into n from public.order_tokens where restaurant_id=p_restaurant_id and token_type=p_token_type and created_at::date=current_date;
  insert into public.order_tokens(restaurant_id,order_id,token_no,token_type,display_name) values(p_restaurant_id,p_order_id,upper(left(p_token_type,1))||lpad(n::text,3,'0'),p_token_type,p_display_name) returning * into v;
  return v;
end $$;

grant execute on function public.issue_order_token(uuid,uuid,text,text) to authenticated;

insert into public.plugin_catalog(code,name,icon,category,description,kind,sort_order) values
('reservations-pro','Advanced Reservations','📅','Operations','Calendar, waitlist, deposits, reminders and no-show workflow.','feature',320),
('captain-runtime','Captain / Waiter Runtime','📱','Staff','Mobile table service, order taking and KOT runtime.','feature',321),
('kds-runtime','Live KDS Runtime','👨‍🍳','Kitchen','Station queues, timers, priorities and bump workflow.','feature',322),
('token-display','Token Display','🎟️','Digital','Live pickup/delivery token queue and customer calling.','feature',323),
('scan-order-runtime','Scan & Order Runtime','📲','Digital','Table QR ordering, reorder and bill request runtime.','feature',324),
('kiosk-runtime','Self-Service Kiosk Runtime','🖥️','Digital','Self-order, payment and token runtime.','feature',325),
('calling-runtime','Calling Device Runtime','📢','Digital','Waiter and service request queue.','feature',326),
('aggregator-runtime','Aggregator Runtime','🔗','Online','Provider configuration, order ingestion, sync jobs and settlements.','feature',327),
('cash-shift','Cash Shift & Drawer','💵','Billing','Opening cash, movements, closing and variance.','feature',328),
('customer-segments','Customer Segmentation','🎯','CRM','VIP, repeat, dormant and rule-based customer segments.','feature',329),
('message-center','SMS / WhatsApp Queue','💬','Marketing','Provider-ready message queue and delivery tracking.','feature',330),
('scheduled-reports','Scheduled Reports','📈','Reports','Recurring report definitions and delivery schedule.','feature',331),
('hardware-print-queue','Hardware Print Queue','🖨️','Integrations','KOT, receipt and invoice print jobs with retry state.','feature',332)
on conflict(code) do update set name=excluded.name,icon=excluded.icon,category=excluded.category,description=excluded.description,kind=excluded.kind,sort_order=excluded.sort_order;

insert into public.restaurant_plugins(restaurant_id,plugin_code,plugin_slug,enabled,config,display_name,category,description,feature_kind)
select r.id,c.code,c.code,false,'{}'::jsonb,c.name,c.category,c.description,c.kind
from public.restaurants r cross join public.plugin_catalog c
where c.code in ('reservations-pro','captain-runtime','kds-runtime','token-display','scan-order-runtime','kiosk-runtime','calling-runtime','aggregator-runtime','cash-shift','customer-segments','message-center','scheduled-reports','hardware-print-queue')
and not exists(select 1 from public.restaurant_plugins rp where rp.restaurant_id=r.id and rp.plugin_code=c.code);
