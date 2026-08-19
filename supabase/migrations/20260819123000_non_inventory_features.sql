-- Anaira POS Phase 2: non-inventory operations.
-- This migration intentionally does NOT create, alter, or reference inventory tables/functions.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  notes text,
  loyalty_points integer not null default 0 check (loyalty_points >= 0),
  total_orders integer not null default 0,
  total_spend numeric(14,2) not null default 0,
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_customers_restaurant_phone
  on public.customers(restaurant_id, phone)
  where phone is not null and phone <> '';
create index if not exists idx_customers_restaurant_name
  on public.customers(restaurant_id, name);

alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists idx_orders_customer_id on public.orders(customer_id);

create table if not exists public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  selection_type text not null default 'single' check (selection_type in ('single','multiple')),
  required boolean not null default false,
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.modifiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  group_id uuid not null references public.modifier_groups(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_modifier_groups_restaurant on public.modifier_groups(restaurant_id);
create index if not exists idx_modifiers_group on public.modifiers(group_id);

create table if not exists public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  modifier_id uuid references public.modifiers(id) on delete set null,
  modifier_name text not null,
  price numeric(12,2) not null default 0,
  quantity integer not null default 1 check (quantity > 0)
);
create index if not exists idx_order_item_modifiers_order_item on public.order_item_modifiers(order_item_id);

create table if not exists public.kot_tickets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  kot_no integer,
  status text not null default 'new' check (status in ('new','preparing','ready','served','cancelled')),
  printed_at timestamptz,
  reprint_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_kot_restaurant_created on public.kot_tickets(restaurant_id, created_at desc);
create index if not exists idx_kot_order on public.kot_tickets(order_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category text not null,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  payment_method text not null default 'cash',
  expense_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_restaurant_date on public.expenses(restaurant_id, expense_date desc);

create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_attendance_restaurant_date on public.staff_attendance(restaurant_id, clock_in desc);
create index if not exists idx_attendance_staff on public.staff_attendance(staff_id, clock_in desc);

create table if not exists public.staff_permissions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(restaurant_id, staff_id, permission_key)
);
create index if not exists idx_staff_permissions_staff on public.staff_permissions(restaurant_id, staff_id);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  points integer not null,
  transaction_type text not null check (transaction_type in ('earn','redeem','adjustment','expiry')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_loyalty_customer on public.loyalty_transactions(customer_id, created_at desc);

create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  feedback text,
  created_at timestamptz not null default now()
);
create index if not exists idx_feedback_restaurant_created on public.customer_feedback(restaurant_id, created_at desc);

-- Updated-at helper for customer records.
create or replace function public.touch_customer_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.touch_customer_updated_at();

-- Restaurant-scoped RLS uses the application's existing helper
-- public.is_restaurant_member(uuid). Do not redefine it here because the
-- existing function is already used by other restaurant-scoped policies.

alter table public.customers enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifiers enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.kot_tickets enable row level security;
alter table public.expenses enable row level security;
alter table public.staff_attendance enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.customer_feedback enable row level security;

drop policy if exists customers_scoped on public.customers;
create policy customers_scoped on public.customers for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists modifier_groups_scoped on public.modifier_groups;
create policy modifier_groups_scoped on public.modifier_groups for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists modifiers_scoped on public.modifiers;
create policy modifiers_scoped on public.modifiers for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists kot_scoped on public.kot_tickets;
create policy kot_scoped on public.kot_tickets for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists expenses_scoped on public.expenses;
create policy expenses_scoped on public.expenses for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists attendance_scoped on public.staff_attendance;
create policy attendance_scoped on public.staff_attendance for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists permissions_scoped on public.staff_permissions;
create policy permissions_scoped on public.staff_permissions for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists loyalty_scoped on public.loyalty_transactions;
create policy loyalty_scoped on public.loyalty_transactions for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

drop policy if exists feedback_scoped on public.customer_feedback;
create policy feedback_scoped on public.customer_feedback for all using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));

-- order_item_modifiers is scoped through its order item -> order -> restaurant.
drop policy if exists order_item_modifiers_scoped on public.order_item_modifiers;
create policy order_item_modifiers_scoped on public.order_item_modifiers
for all
using (
  exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_modifiers.order_item_id
      and public.is_restaurant_member(o.restaurant_id)
  )
)
with check (
  exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_modifiers.order_item_id
      and public.is_restaurant_member(o.restaurant_id)
  )
);

-- Helpful restaurant-scoped indexes for the new features.
create index if not exists idx_orders_restaurant_customer on public.orders(restaurant_id, customer_id);
create index if not exists idx_orders_restaurant_billed_at on public.orders(restaurant_id, billed_at desc);
