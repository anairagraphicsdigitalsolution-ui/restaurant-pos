-- Anaira Restaurant Suite: Petpooja-style operational expansion.
-- NON-DESTRUCTIVE: only creates new tables/functions/triggers/indexes and does not delete or rewrite existing business data.

create table if not exists public.order_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  token_date date not null default current_date,
  token_no integer not null,
  token_type text not null default 'takeaway',
  status text not null default 'new',
  pickup_name text,
  pickup_phone text,
  otp text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  picked_up_at timestamptz,
  unique(restaurant_id, token_date, token_no)
);

create index if not exists idx_order_tokens_board
  on public.order_tokens(restaurant_id, token_date, status, token_no);

create table if not exists public.captain_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  staff_id uuid,
  staff_name text,
  device_name text,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.online_channels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  channel_code text not null,
  channel_name text not null,
  active boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, channel_code)
);

create table if not exists public.online_order_reconciliations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  channel_code text not null,
  external_order_id text,
  order_id uuid,
  gross_amount numeric not null default 0,
  discounts numeric not null default 0,
  commission numeric not null default 0,
  platform_charges numeric not null default 0,
  tax numeric not null default 0,
  payout_amount numeric not null default 0,
  cancellation_amount numeric not null default 0,
  settlement_status text not null default 'pending',
  payout_reference text,
  order_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_online_reconciliation
  on public.online_order_reconciliations(restaurant_id, channel_code, order_date desc);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  channel text not null default 'whatsapp',
  status text not null default 'draft',
  audience_filter jsonb not null default '{}'::jsonb,
  message text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.food_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  menu_item_id uuid not null,
  recipe_cost numeric not null default 0,
  selling_price numeric not null default 0,
  food_cost_percent numeric not null default 0,
  margin numeric not null default 0,
  calculated_at timestamptz not null default now()
);

create table if not exists public.self_service_kiosks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  kiosk_code text,
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.digital_display_playlists (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  screen_type text not null default 'menu',
  items jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calling_devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  device_code text,
  location text,
  active boolean not null default true,
  last_called_at timestamptz
);

-- Generic restaurant-scoped RLS for the new suite tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'order_tokens',
    'captain_sessions',
    'online_channels',
    'online_order_reconciliations',
    'marketing_campaigns',
    'food_cost_snapshots',
    'self_service_kiosks',
    'digital_display_playlists',
    'calling_devices'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'restaurant members ' || t, t);
    execute format(
      'create policy %I on public.%I for all using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())) with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))',
      'restaurant members ' || t, t
    );
  end loop;
end $$;

-- Safe token generator. It locks only the current day's token rows for the restaurant.
create or replace function public.create_order_token(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_token_type text default 'takeaway',
  p_pickup_name text default null,
  p_pickup_phone text default null
)
returns public.order_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.order_tokens%rowtype;
  v_next integer;
begin
  if not exists (
    select 1 from public.orders
    where id = p_order_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'Order not found for restaurant';
  end if;

  select coalesce(max(token_no), 0) + 1
    into v_next
  from public.order_tokens
  where restaurant_id = p_restaurant_id
    and token_date = current_date;

  insert into public.order_tokens(
    restaurant_id, order_id, token_date, token_no, token_type,
    pickup_name, pickup_phone
  )
  values(
    p_restaurant_id, p_order_id, current_date, v_next,
    coalesce(nullif(trim(p_token_type), ''), 'takeaway'),
    nullif(trim(p_pickup_name), ''),
    nullif(trim(p_pickup_phone), '')
  )
  returning * into v_token;

  return v_token;
end;
$$;

-- Automatic recipe-based stock deduction when an order reaches a terminal sale state.
-- Existing inventory data is preserved; only future terminal transitions are affected.
create or replace function public.apply_recipe_stock_deduction(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_recipe public.restaurant_recipes%rowtype;
  v_recipe_item public.restaurant_recipe_items%rowtype;
  v_deduct numeric;
  v_new_qty numeric;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then return; end if;

  for v_item in
    select oi.item_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select * into v_recipe
    from public.restaurant_recipes
    where restaurant_id = v_order.restaurant_id
      and menu_item_id = v_item.item_id
    limit 1;

    if not found then continue; end if;

    for v_recipe_item in
      select *
      from public.restaurant_recipe_items
      where recipe_id = v_recipe.id
    loop
      if exists (
        select 1
        from public.inventory_transactions
        where restaurant_id = v_order.restaurant_id
          and inventory_id = v_recipe_item.inventory_id
          and reference_id = p_order_id
          and transaction_type = 'recipe_sale'
      ) then
        continue;
      end if;

      v_deduct := coalesce(v_recipe_item.quantity, 0) *
                  coalesce(v_item.quantity, 0) /
                  greatest(coalesce(v_recipe.yield_qty, 1), 1);

      if v_deduct <= 0 then continue; end if;

      update public.inventory
      set quantity = coalesce(quantity, 0) - v_deduct
      where id = v_recipe_item.inventory_id
        and restaurant_id = v_order.restaurant_id
      returning quantity into v_new_qty;

      if v_new_qty is null then continue; end if;

      insert into public.inventory_transactions(
        restaurant_id, inventory_id, transaction_type,
        quantity_delta, quantity_after, reference_id, reason, actor_id
      )
      values(
        v_order.restaurant_id,
        v_recipe_item.inventory_id,
        'recipe_sale',
        -v_deduct,
        v_new_qty,
        p_order_id,
        'Automatic recipe stock deduction',
        null
      );
    end loop;
  end loop;
end;
$$;

create or replace function public.trg_order_terminal_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.status,'')) in ('done','completed','served','paid')
     and lower(coalesce(old.status,'')) not in ('done','completed','served','paid') then
    perform public.apply_recipe_stock_deduction(new.id);
  end if;

  if lower(coalesce(new.order_mode,'')) in ('takeaway','delivery')
     and not exists (
       select 1 from public.order_tokens
       where order_id = new.id
     ) then
    perform public.create_order_token(
      new.restaurant_id,
      new.id,
      lower(new.order_mode),
      null,
      null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_terminal_automation on public.orders;
create trigger trg_order_terminal_automation
after insert or update of status, order_mode on public.orders
for each row execute function public.trg_order_terminal_automation();

-- Food-cost calculation helper.
create or replace function public.calculate_food_cost(
  p_restaurant_id uuid,
  p_menu_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe public.restaurant_recipes%rowtype;
  v_cost numeric := 0;
  v_price numeric := 0;
  v_row record;
begin
  select * into v_recipe
  from public.restaurant_recipes
  where restaurant_id = p_restaurant_id
    and menu_item_id = p_menu_item_id
  limit 1;

  select coalesce(price,0) into v_price
  from public.menu_items
  where id = p_menu_item_id
    and restaurant_id = p_restaurant_id;

  if not found then
    raise exception 'Menu item not found';
  end if;

  if found then
    for v_row in
      select ri.quantity, coalesce(i.cost_price,0) cost_price
      from public.restaurant_recipe_items ri
      join public.inventory i on i.id = ri.inventory_id
      where ri.recipe_id = v_recipe.id
    loop
      v_cost := v_cost + coalesce(v_row.quantity,0) * coalesce(v_row.cost_price,0);
    end loop;
  end if;

  return jsonb_build_object(
    'menu_item_id', p_menu_item_id,
    'recipe_cost', round(v_cost,2),
    'selling_price', round(v_price,2),
    'food_cost_percent',
      case when v_price > 0 then round((v_cost / v_price) * 100,2) else 0 end,
    'margin', round(v_price - v_cost,2)
  );
end;
$$;
