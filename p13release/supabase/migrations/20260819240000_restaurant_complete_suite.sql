-- ANAIRA RESTAURANT COMPLETE SUITE
-- All restaurant operational features are optional/configurable.
-- GST remains OFF by default.

-- Existing order/table configuration
alter table public.orders
  add column if not exists order_mode text default 'dine_in',
  add column if not exists service_charge_amount numeric default 0,
  add column if not exists tip_amount numeric default 0,
  add column if not exists tax_amount numeric default 0,
  add column if not exists discount_amount numeric default 0,
  add column if not exists coupon_code text,
  add column if not exists hold_status text default 'active',
  add column if not exists void_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists priority text default 'normal',
  add column if not exists kitchen_due_at timestamptz,
  add column if not exists waiter_id uuid,
  add column if not exists customer_id uuid;

alter table public.tables
  add column if not exists floor text default 'Ground Floor',
  add column if not exists section text default 'Main',
  add column if not exists shape text default 'rectangle',
  add column if not exists position_x numeric default 0,
  add column if not exists position_y numeric default 0,
  add column if not exists status text default 'available',
  add column if not exists waiter_id uuid,
  add column if not exists qr_enabled boolean default true;

alter table public.restaurants
  add column if not exists gst_enabled boolean default false,
  add column if not exists gst_number text,
  add column if not exists default_tax_percent numeric default 0,
  add column if not exists service_charge_enabled boolean default false,
  add column if not exists service_charge_percent numeric default 0,
  add column if not exists tip_enabled boolean default true,
  add column if not exists delivery_enabled boolean default false,
  add column if not exists min_delivery_order numeric default 0,
  add column if not exists currency text default 'INR';

-- Payments
create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  payment_method text not null check (payment_method in ('cash','card','upi','online','credit','other')),
  amount numeric not null default 0,
  reference text,
  status text not null default 'paid' check (status in ('pending','paid','refunded','void')),
  paid_at timestamptz default now(),
  created_by uuid,
  notes text
);

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  payment_id uuid,
  amount numeric not null default 0,
  reason text,
  status text default 'refunded',
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.order_splits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  split_no integer not null,
  amount numeric not null default 0,
  payment_status text default 'unpaid',
  created_at timestamptz default now(),
  unique(order_id,split_no)
);

create table if not exists public.order_split_items (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references public.order_splits(id) on delete cascade,
  order_item_id uuid not null,
  quantity numeric not null default 1
);

create table if not exists public.order_transfers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  from_table_id uuid,
  to_table_id uuid,
  moved_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.order_item_moves (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_item_id uuid not null,
  order_id uuid not null,
  from_table_id uuid,
  to_table_id uuid,
  quantity numeric not null default 1,
  moved_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.order_holds (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  hold_type text not null default 'hold',
  note text,
  created_by uuid,
  created_at timestamptz default now(),
  released_at timestamptz
);

-- KDS
create table if not exists public.kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  station_type text default 'kitchen',
  active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_order_tickets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  station_id uuid,
  status text default 'new',
  priority text default 'normal',
  due_at timestamptz,
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  bumped_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- Inventory / costing
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  inventory_id uuid,
  movement_type text not null,
  quantity numeric not null default 0,
  unit text,
  reference_type text,
  reference_id uuid,
  unit_cost numeric default 0,
  reason text,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  inventory_id uuid,
  batch_no text,
  quantity numeric default 0,
  unit text,
  unit_cost numeric default 0,
  received_at timestamptz default now(),
  expiry_date date,
  status text default 'active'
);

create table if not exists public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  inventory_id uuid,
  from_location text,
  to_location text,
  quantity numeric default 0,
  unit text,
  status text default 'completed',
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.inventory_wastage (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  inventory_id uuid,
  quantity numeric default 0,
  unit text,
  reason text,
  cost numeric default 0,
  created_by uuid,
  created_at timestamptz default now()
);

-- Purchase / supplier
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  supplier_id uuid,
  po_number text,
  status text default 'draft',
  subtotal numeric default 0,
  tax numeric default 0,
  total numeric default 0,
  expected_date date,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  purchase_order_id uuid,
  grn_number text,
  received_by uuid,
  received_at timestamptz default now(),
  notes text
);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  supplier_id uuid,
  amount numeric default 0,
  payment_method text default 'cash',
  reference text,
  paid_at timestamptz default now(),
  created_by uuid
);

-- Delivery
create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  charge numeric default 0,
  min_order numeric default 0,
  active boolean default true
);

create table if not exists public.delivery_riders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  phone text,
  vehicle text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  delivery_id uuid,
  status text not null,
  note text,
  created_by uuid,
  created_at timestamptz default now()
);

-- CRM / membership
create table if not exists public.customer_memberships (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  customer_id uuid,
  plan_name text not null,
  status text default 'active',
  starts_at timestamptz default now(),
  expires_at timestamptz,
  discount_percent numeric default 0,
  points_multiplier numeric default 1,
  created_at timestamptz default now()
);

create table if not exists public.customer_preferences (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  customer_id uuid,
  birthday date,
  anniversary date,
  favorite_items jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  vip boolean default false,
  notes text,
  updated_at timestamptz default now(),
  unique(restaurant_id,customer_id)
);

-- Reservations
alter table public.reservations
  add column if not exists status text default 'booked',
  add column if not exists waitlist boolean default false,
  add column if not exists deposit_amount numeric default 0,
  add column if not exists occasion text,
  add column if not exists vip boolean default false,
  add column if not exists no_show boolean default false,
  add column if not exists reminder_sent boolean default false;

-- Staff / permissions / payroll foundation
create table if not exists public.staff_attendance_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  staff_id uuid,
  event_type text not null,
  at timestamptz default now(),
  notes text
);

create table if not exists public.staff_breaks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  staff_id uuid,
  started_at timestamptz default now(),
  ended_at timestamptz,
  notes text
);

create table if not exists public.staff_pay_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  staff_id uuid,
  salary numeric default 0,
  commission_percent numeric default 0,
  overtime_rate numeric default 0,
  effective_from date default current_date
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  role text not null,
  permission text not null,
  allowed boolean default true,
  unique(restaurant_id,role,permission)
);

-- Reviews
create table if not exists public.review_replies (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  feedback_id uuid,
  reply text not null,
  replied_by uuid,
  created_at timestamptz default now()
);

-- Cashier / expenses
create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  session_id uuid,
  movement_type text not null,
  amount numeric default 0,
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz default now()
);

-- Multi-branch foundation
create table if not exists public.restaurant_branches (
  id uuid primary key default gen_random_uuid(),
  parent_restaurant_id uuid not null,
  name text not null,
  code text,
  address text,
  phone text,
  active boolean default true,
  created_at timestamptz default now(),
  unique(parent_restaurant_id,code)
);

create table if not exists public.branch_menu_overrides (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.restaurant_branches(id) on delete cascade,
  menu_item_id uuid not null,
  enabled boolean default true,
  price numeric,
  created_at timestamptz default now(),
  unique(branch_id,menu_item_id)
);

create table if not exists public.branch_inventory_balances (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.restaurant_branches(id) on delete cascade,
  inventory_id uuid not null,
  quantity numeric default 0,
  reorder_level numeric default 0,
  unique(branch_id,inventory_id)
);

-- Indexes
create index if not exists idx_order_payments_order on public.order_payments(order_id);
create index if not exists idx_order_payments_restaurant on public.order_payments(restaurant_id);
create index if not exists idx_order_refunds_order on public.order_refunds(order_id);
create index if not exists idx_order_splits_order on public.order_splits(order_id);
create index if not exists idx_order_transfers_order on public.order_transfers(order_id);
create index if not exists idx_order_item_moves_order on public.order_item_moves(order_id);
create index if not exists idx_order_holds_order on public.order_holds(order_id);
create index if not exists idx_kitchen_tickets_order on public.kitchen_order_tickets(order_id);
create index if not exists idx_inventory_movements_restaurant on public.inventory_movements(restaurant_id);
create index if not exists idx_inventory_batches_expiry on public.inventory_batches(expiry_date);
create index if not exists idx_purchase_orders_restaurant on public.purchase_orders(restaurant_id);
create index if not exists idx_supplier_payments_restaurant on public.supplier_payments(restaurant_id);
create index if not exists idx_delivery_events_delivery on public.delivery_events(delivery_id);
create index if not exists idx_customer_memberships_customer on public.customer_memberships(customer_id);
create index if not exists idx_staff_events_staff on public.staff_attendance_events(staff_id);
create index if not exists idx_cash_movements_session on public.cash_movements(session_id);

-- Explicit RLS policies (avoids dynamic EXECUTE/format issues in Supabase migration runner).
alter table public.order_payments enable row level security;
drop policy if exists "restaurant members order_payments" on public.order_payments;
create policy "restaurant members order_payments" on public.order_payments
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.order_refunds enable row level security;
drop policy if exists "restaurant members order_refunds" on public.order_refunds;
create policy "restaurant members order_refunds" on public.order_refunds
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.order_splits enable row level security;
drop policy if exists "restaurant members order_splits" on public.order_splits;
create policy "restaurant members order_splits" on public.order_splits
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.order_transfers enable row level security;
drop policy if exists "restaurant members order_transfers" on public.order_transfers;
create policy "restaurant members order_transfers" on public.order_transfers
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.order_item_moves enable row level security;
drop policy if exists "restaurant members order_item_moves" on public.order_item_moves;
create policy "restaurant members order_item_moves" on public.order_item_moves
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.order_holds enable row level security;
drop policy if exists "restaurant members order_holds" on public.order_holds;
create policy "restaurant members order_holds" on public.order_holds
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.kitchen_stations enable row level security;
drop policy if exists "restaurant members kitchen_stations" on public.kitchen_stations;
create policy "restaurant members kitchen_stations" on public.kitchen_stations
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.kitchen_order_tickets enable row level security;
drop policy if exists "restaurant members kitchen_order_tickets" on public.kitchen_order_tickets;
create policy "restaurant members kitchen_order_tickets" on public.kitchen_order_tickets
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.inventory_movements enable row level security;
drop policy if exists "restaurant members inventory_movements" on public.inventory_movements;
create policy "restaurant members inventory_movements" on public.inventory_movements
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.inventory_batches enable row level security;
drop policy if exists "restaurant members inventory_batches" on public.inventory_batches;
create policy "restaurant members inventory_batches" on public.inventory_batches
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.inventory_transfers enable row level security;
drop policy if exists "restaurant members inventory_transfers" on public.inventory_transfers;
create policy "restaurant members inventory_transfers" on public.inventory_transfers
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.inventory_wastage enable row level security;
drop policy if exists "restaurant members inventory_wastage" on public.inventory_wastage;
create policy "restaurant members inventory_wastage" on public.inventory_wastage
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.purchase_orders enable row level security;
drop policy if exists "restaurant members purchase_orders" on public.purchase_orders;
create policy "restaurant members purchase_orders" on public.purchase_orders
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.goods_receipts enable row level security;
drop policy if exists "restaurant members goods_receipts" on public.goods_receipts;
create policy "restaurant members goods_receipts" on public.goods_receipts
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.supplier_payments enable row level security;
drop policy if exists "restaurant members supplier_payments" on public.supplier_payments;
create policy "restaurant members supplier_payments" on public.supplier_payments
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.delivery_zones enable row level security;
drop policy if exists "restaurant members delivery_zones" on public.delivery_zones;
create policy "restaurant members delivery_zones" on public.delivery_zones
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.delivery_riders enable row level security;
drop policy if exists "restaurant members delivery_riders" on public.delivery_riders;
create policy "restaurant members delivery_riders" on public.delivery_riders
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.delivery_events enable row level security;
drop policy if exists "restaurant members delivery_events" on public.delivery_events;
create policy "restaurant members delivery_events" on public.delivery_events
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.customer_memberships enable row level security;
drop policy if exists "restaurant members customer_memberships" on public.customer_memberships;
create policy "restaurant members customer_memberships" on public.customer_memberships
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.customer_preferences enable row level security;
drop policy if exists "restaurant members customer_preferences" on public.customer_preferences;
create policy "restaurant members customer_preferences" on public.customer_preferences
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.staff_attendance_events enable row level security;
drop policy if exists "restaurant members staff_attendance_events" on public.staff_attendance_events;
create policy "restaurant members staff_attendance_events" on public.staff_attendance_events
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.staff_breaks enable row level security;
drop policy if exists "restaurant members staff_breaks" on public.staff_breaks;
create policy "restaurant members staff_breaks" on public.staff_breaks
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.staff_pay_rules enable row level security;
drop policy if exists "restaurant members staff_pay_rules" on public.staff_pay_rules;
create policy "restaurant members staff_pay_rules" on public.staff_pay_rules
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.role_permissions enable row level security;
drop policy if exists "restaurant members role_permissions" on public.role_permissions;
create policy "restaurant members role_permissions" on public.role_permissions
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.review_replies enable row level security;
drop policy if exists "restaurant members review_replies" on public.review_replies;
create policy "restaurant members review_replies" on public.review_replies
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
alter table public.cash_movements enable row level security;
drop policy if exists "restaurant members cash_movements" on public.cash_movements;
create policy "restaurant members cash_movements" on public.cash_movements
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));

alter table public.order_split_items enable row level security;
drop policy if exists "restaurant members order split items" on public.order_split_items;
create policy "restaurant members order split items" on public.order_split_items for all using (
  split_id in (select id from public.order_splits where restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()))
) with check (
  split_id in (select id from public.order_splits where restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()))
);

alter table public.restaurant_branches enable row level security;
drop policy if exists "restaurant members branches" on public.restaurant_branches;
create policy "restaurant members branches" on public.restaurant_branches for all using (
  parent_restaurant_id=(select restaurant_id from public.profiles where id=auth.uid())
) with check (
  parent_restaurant_id=(select restaurant_id from public.profiles where id=auth.uid())
);

alter table public.branch_menu_overrides enable row level security;
drop policy if exists "branch menu access" on public.branch_menu_overrides;
create policy "branch menu access" on public.branch_menu_overrides for all using (
  branch_id in (select id from public.restaurant_branches where parent_restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()))
) with check (
  branch_id in (select id from public.restaurant_branches where parent_restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()))
);

alter table public.branch_inventory_balances enable row level security;
drop policy if exists "branch inventory access" on public.branch_inventory_balances;
create policy "branch inventory access" on public.branch_inventory_balances for all using (
  branch_id in (select id from public.restaurant_branches where parent_restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()))
) with check (
  branch_id in (select id from public.restaurant_branches where parent_restaurant_id=(select restaurant_id from public.profiles where id=auth.uid()))
);

-- Analytics view: sales/payment totals by day, when payment rows exist.
create or replace view public.restaurant_daily_payment_summary as
select
  restaurant_id,
  date_trunc('day', paid_at)::date as sale_date,
  sum(case when payment_method='cash' and status='paid' then amount else 0 end) as cash_sales,
  sum(case when payment_method='card' and status='paid' then amount else 0 end) as card_sales,
  sum(case when payment_method='upi' and status='paid' then amount else 0 end) as upi_sales,
  sum(case when payment_method not in ('cash','card','upi') and status='paid' then amount else 0 end) as other_sales,
  sum(case when status='paid' then amount else 0 end) as total_paid,
  sum(case when status='refunded' then amount else 0 end) as total_refunded
from public.order_payments
group by restaurant_id,date_trunc('day',paid_at)::date;
