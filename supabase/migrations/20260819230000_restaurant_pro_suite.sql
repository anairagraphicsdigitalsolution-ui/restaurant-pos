-- Restaurant Pro Suite
-- GST is optional and disabled by default.
create extension if not exists "pgcrypto";

alter table public.restaurants
  add column if not exists gst_enabled boolean default false,
  add column if not exists gst_number text,
  add column if not exists service_charge_enabled boolean default false,
  add column if not exists service_charge_percent numeric default 0,
  add column if not exists default_tax_percent numeric default 0,
  add column if not exists delivery_enabled boolean default false;

create table if not exists public.restaurant_suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  phone text,
  email text,
  address text,
  gst_number text,
  payment_terms text,
  opening_balance numeric default 0,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.restaurant_recipes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  menu_item_id uuid not null,
  yield_qty numeric default 1,
  notes text,
  created_at timestamptz default now(),
  unique(restaurant_id, menu_item_id)
);

create table if not exists public.restaurant_recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.restaurant_recipes(id) on delete cascade,
  inventory_id uuid not null,
  quantity numeric not null default 0,
  unit text,
  created_at timestamptz default now()
);

create table if not exists public.restaurant_purchases (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  supplier_id uuid,
  invoice_number text,
  status text not null default 'received',
  subtotal numeric default 0,
  tax numeric default 0,
  total numeric default 0,
  paid numeric default 0,
  notes text,
  purchase_date date default current_date,
  created_at timestamptz default now()
);

create table if not exists public.restaurant_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.restaurant_purchases(id) on delete cascade,
  inventory_id uuid,
  name text not null,
  quantity numeric default 0,
  unit text,
  unit_cost numeric default 0,
  total numeric generated always as (quantity * unit_cost) stored
);

create table if not exists public.restaurant_deliveries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid,
  customer_name text,
  phone text,
  address text,
  zone text,
  delivery_charge numeric default 0,
  rider_name text,
  rider_phone text,
  status text not null default 'pending',
  payment_status text not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.restaurant_staff_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  staff_id uuid,
  staff_name text,
  shift_date date default current_date,
  start_time timestamptz,
  end_time timestamptz,
  status text default 'scheduled',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.restaurant_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  opened_by uuid,
  opened_at timestamptz default now(),
  closed_at timestamptz,
  opening_cash numeric default 0,
  expected_cash numeric default 0,
  actual_cash numeric,
  difference numeric,
  status text default 'open',
  notes text
);

create table if not exists public.restaurant_loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  customer_id uuid,
  points integer default 0,
  tier text default 'Silver',
  lifetime_points integer default 0,
  created_at timestamptz default now(),
  unique(restaurant_id, customer_id)
);

create table if not exists public.restaurant_loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  loyalty_account_id uuid not null references public.restaurant_loyalty_accounts(id) on delete cascade,
  points integer not null,
  reason text,
  order_id uuid,
  created_at timestamptz default now()
);

create index if not exists idx_restaurant_suppliers_restaurant on public.restaurant_suppliers(restaurant_id);
create index if not exists idx_restaurant_recipes_restaurant on public.restaurant_recipes(restaurant_id);
create index if not exists idx_restaurant_purchases_restaurant on public.restaurant_purchases(restaurant_id);
create index if not exists idx_restaurant_deliveries_restaurant on public.restaurant_deliveries(restaurant_id);
create index if not exists idx_restaurant_staff_shifts_restaurant on public.restaurant_staff_shifts(restaurant_id);
create index if not exists idx_restaurant_cash_sessions_restaurant on public.restaurant_cash_sessions(restaurant_id);
create index if not exists idx_restaurant_loyalty_restaurant on public.restaurant_loyalty_accounts(restaurant_id);

-- RLS: restaurant members may access only their own restaurant's rows.
alter table public.restaurant_suppliers enable row level security;
alter table public.restaurant_recipes enable row level security;
alter table public.restaurant_recipe_items enable row level security;
alter table public.restaurant_purchases enable row level security;
alter table public.restaurant_purchase_items enable row level security;
alter table public.restaurant_deliveries enable row level security;
alter table public.restaurant_staff_shifts enable row level security;
alter table public.restaurant_cash_sessions enable row level security;
alter table public.restaurant_loyalty_accounts enable row level security;
alter table public.restaurant_loyalty_transactions enable row level security;

drop policy if exists "restaurant members suppliers" on public.restaurant_suppliers;
create policy "restaurant members suppliers" on public.restaurant_suppliers for all using (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
) with check (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
);

drop policy if exists "restaurant members recipes" on public.restaurant_recipes;
create policy "restaurant members recipes" on public.restaurant_recipes for all using (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
) with check (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
);

drop policy if exists "restaurant members purchases" on public.restaurant_purchases;
create policy "restaurant members purchases" on public.restaurant_purchases for all using (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
) with check (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
);

drop policy if exists "restaurant members deliveries" on public.restaurant_deliveries;
create policy "restaurant members deliveries" on public.restaurant_deliveries for all using (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
) with check (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
);

drop policy if exists "restaurant members shifts" on public.restaurant_staff_shifts;
create policy "restaurant members shifts" on public.restaurant_staff_shifts for all using (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
) with check (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
);

drop policy if exists "restaurant members cash" on public.restaurant_cash_sessions;
create policy "restaurant members cash" on public.restaurant_cash_sessions for all using (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
) with check (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
);

drop policy if exists "restaurant members loyalty" on public.restaurant_loyalty_accounts;
create policy "restaurant members loyalty" on public.restaurant_loyalty_accounts for all using (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
) with check (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
);

drop policy if exists "restaurant members loyalty tx" on public.restaurant_loyalty_transactions;
create policy "restaurant members loyalty tx" on public.restaurant_loyalty_transactions for all using (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
) with check (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
);

drop policy if exists "restaurant members recipe items" on public.restaurant_recipe_items;
create policy "restaurant members recipe items" on public.restaurant_recipe_items for all using (
  recipe_id in (
    select id from public.restaurant_recipes
    where restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
  )
) with check (
  recipe_id in (
    select id from public.restaurant_recipes
    where restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
  )
);

drop policy if exists "restaurant members purchase items" on public.restaurant_purchase_items;
create policy "restaurant members purchase items" on public.restaurant_purchase_items for all using (
  purchase_id in (
    select id from public.restaurant_purchases
    where restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
  )
) with check (
  purchase_id in (
    select id from public.restaurant_purchases
    where restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
  )
);
