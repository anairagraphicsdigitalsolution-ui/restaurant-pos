-- Anaira non-inventory operations completion v6.
-- Additive only. Inventory tables and inventory logic are intentionally untouched.
-- Provides production-facing restaurant workflows: tables, billing controls,
-- discounts, variants, KDS routing, delivery assignment/OTP, feedback,
-- audit, multi-branch settings and offline/payment/printing configuration.

create table if not exists public.restaurant_areas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(restaurant_id,name)
);

create table if not exists public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  area_id uuid references public.restaurant_areas(id) on delete set null,
  table_no text not null,
  capacity integer not null default 2,
  shape text not null default 'square',
  status text not null default 'available',
  x integer not null default 0,
  y integer not null default 0,
  width integer not null default 120,
  height integer not null default 80,
  qr_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(restaurant_id,table_no)
);

alter table public.orders add column if not exists table_id uuid;
alter table public.orders add column if not exists service_charge numeric(12,2) not null default 0;
alter table public.orders add column if not exists tip_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists packaging_charge numeric(12,2) not null default 0;
alter table public.orders add column if not exists customer_note text;
alter table public.orders add column if not exists delivery_address text;

create table if not exists public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.dining_tables(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  guest_count integer not null default 1,
  status text not null default 'open'
);

create table if not exists public.discount_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  code text,
  discount_type text not null default 'percent',
  value numeric(12,2) not null default 0,
  min_order numeric(12,2) not null default 0,
  max_discount numeric(12,2),
  applies_to text not null default 'bill',
  requires_manager boolean not null default false,
  active boolean not null default true,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  unique(restaurant_id,code)
);

create table if not exists public.order_discount_applications (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  discount_rule_id uuid references public.discount_rules(id) on delete set null,
  discount_amount numeric(12,2) not null default 0,
  approved_by uuid,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_variants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  price_delta numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(menu_item_id,name)
);

create table if not exists public.kot_routes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  station_id uuid references public.kitchen_stations(id) on delete cascade,
  category text,
  printer_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  rider_id uuid references public.delivery_riders(id) on delete set null,
  status text not null default 'assigned',
  delivery_charge numeric(12,2) not null default 0,
  address text,
  proof_url text,
  assigned_at timestamptz not null default now(),
  out_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text
);

create table if not exists public.delivery_otps (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null default 'qr',
  token text not null unique,
  status text not null default 'pending',
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pos_audit_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.offline_pos_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  terminal_id uuid,
  client_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique(restaurant_id,client_event_id)
);

create table if not exists public.branch_menu_overrides (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  available boolean not null default true,
  price_override numeric(12,2),
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(branch_id,menu_item_id)
);

create table if not exists public.restaurant_payment_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  payment_method text not null,
  enabled boolean not null default true,
  instructions text,
  updated_at timestamptz not null default now(),
  unique(restaurant_id,payment_method)
);

create index if not exists idx_dining_tables_restaurant on public.dining_tables(restaurant_id,area_id,status);
create index if not exists idx_table_sessions_restaurant on public.table_sessions(restaurant_id,opened_at desc);
create index if not exists idx_discount_rules_restaurant on public.discount_rules(restaurant_id,active);
create index if not exists idx_order_discount_applications_order on public.order_discount_applications(order_id);
create index if not exists idx_menu_variants_item on public.menu_variants(menu_item_id,active);
create index if not exists idx_kot_routes_restaurant on public.kot_routes(restaurant_id,active);
create index if not exists idx_delivery_assignments_order on public.delivery_assignments(order_id);
create index if not exists idx_delivery_assignments_rider on public.delivery_assignments(rider_id,status);
create index if not exists idx_feedback_requests_restaurant on public.feedback_requests(restaurant_id,status);
create index if not exists idx_pos_audit_restaurant on public.pos_audit_events(restaurant_id,created_at desc);
create index if not exists idx_offline_pos_events_restaurant on public.offline_pos_events(restaurant_id,status,created_at);
create index if not exists idx_branch_menu_overrides_branch on public.branch_menu_overrides(branch_id,menu_item_id);
create index if not exists idx_payment_settings_restaurant on public.restaurant_payment_settings(restaurant_id);

do $$
declare
  t record;
begin
  for t in
    select v.table_name
    from (
      values
        ('restaurant_areas'),
        ('dining_tables'),
        ('table_sessions'),
        ('discount_rules'),
        ('order_discount_applications'),
        ('menu_variants'),
        ('kot_routes'),
        ('delivery_assignments'),
        ('delivery_otps'),
        ('feedback_requests'),
        ('pos_audit_events'),
        ('offline_pos_events'),
        ('branch_menu_overrides'),
        ('restaurant_payment_settings')
    ) as v(table_name)
    where exists (
      select 1
      from information_schema.tables it
      where it.table_schema = 'public'
        and it.table_name = v.table_name
    )
      and exists (
        select 1
        from information_schema.columns ic
        where ic.table_schema = 'public'
          and ic.table_name = v.table_name
          and ic.column_name = 'restaurant_id'
      )
  loop
    execute format(
      'alter table public.%I enable row level security',
      t.table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      'restaurant scoped v6 ' || t.table_name,
      t.table_name
    );

    execute format(
      'create policy %I on public.%I
       for all
       using (public.is_restaurant_member(restaurant_id))
       with check (public.is_restaurant_member(restaurant_id))',
      'restaurant scoped v6 ' || t.table_name,
      t.table_name
    );
  end loop;
end $$;

-- Table status helper. It updates only the non-inventory table layer.
create or replace function public.set_dining_table_status(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_status text
) returns public.dining_tables
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.dining_tables%rowtype;
begin
  if not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'Not authorized';
  end if;

  update public.dining_tables
  set status = lower(trim(p_status))
  where id = p_table_id and restaurant_id = p_restaurant_id
  returning * into v_row;

  if not found then raise exception 'Table not found'; end if;
  return v_row;
end;
$$;

-- Manual discount application. It updates order totals and leaves inventory untouched.
create or replace function public.apply_discount_rule(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_rule_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_rule public.discount_rules%rowtype;
  v_discount numeric(12,2) := 0;
  v_subtotal numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
begin
  if not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_order from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if not found then raise exception 'Order not found'; end if;

  select * into v_rule from public.discount_rules
  where id=p_rule_id and restaurant_id=p_restaurant_id and active=true
    and (valid_from is null or valid_from <= current_date)
    and (valid_to is null or valid_to >= current_date);
  if not found then raise exception 'Discount rule is not active'; end if;

  v_subtotal := coalesce(v_order.subtotal, v_order.total_amount, 0);
  if v_subtotal < coalesce(v_rule.min_order,0) then
    raise exception 'Minimum order value not met';
  end if;

  if lower(v_rule.discount_type)='flat' then
    v_discount := least(v_subtotal, greatest(v_rule.value,0));
  else
    v_discount := least(
      v_subtotal,
      v_subtotal * least(greatest(v_rule.value,0),100) / 100
    );
  end if;

  if v_rule.max_discount is not null then
    v_discount := least(v_discount, greatest(v_rule.max_discount,0));
  end if;

  select round(
    greatest(v_subtotal-v_discount,0)
    * greatest(coalesce(r.gst_rate,0),0) / 100, 2
  ) into v_tax
  from public.restaurants r where r.id=p_restaurant_id;

  v_total := round(greatest(v_subtotal-v_discount,0)+v_tax,2);

  update public.orders
  set discount_amount=v_discount,tax_amount=v_tax,total_amount=v_total
  where id=p_order_id;

  insert into public.order_discount_applications(
    restaurant_id,order_id,discount_rule_id,discount_amount,approved_by,reason
  ) values (
    p_restaurant_id,p_order_id,p_rule_id,v_discount,auth.uid(),p_reason
  );

  insert into public.pos_audit_events(
    restaurant_id,actor_id,action,entity_type,entity_id,after_data,reason
  ) values (
    p_restaurant_id,auth.uid(),'discount.applied','order',p_order_id,
    jsonb_build_object('discount',v_discount,'total',v_total),p_reason
  );

  return jsonb_build_object(
    'order_id',p_order_id,
    'discount_amount',v_discount,
    'tax_amount',v_tax,
    'total_amount',v_total
  );
end;
$$;

grant execute on function public.set_dining_table_status(uuid,uuid,text) to authenticated;
grant execute on function public.apply_discount_rule(uuid,uuid,uuid,text) to authenticated;

insert into public.plugin_catalog(code,name,icon,category,description,kind,sort_order) values
('offline-billing','Offline Billing','📴','POS','Queue-safe offline POS events with terminal synchronization.','feature',301),
('feedback-reviews','Feedback & Reviews','💬','CRM','QR feedback requests, ratings and review follow-up.','feature',302),
('delivery-otp','Delivery OTP & Proof','🔐','Delivery','Delivery OTP verification, proof and failed-delivery workflow.','feature',303),
('menu-variants','Menu Variants','🍽️','POS','Size/portion variants with price deltas.','feature',304),
('discount-engine','Discount Engine','🏷️','Billing','Manual discounts, coupons, limits and manager approval.','feature',305),
('kot-routing','KOT Routing','🖨️','Kitchen','Station/category routing for KOT and printers.','feature',306),
('ebill','E-Bill','📄','Billing','Customer e-bill generation and delivery tracking.','feature',307),
('scan-pay','Scan & Pay','📲','Payments','Table QR payment requests and settlement workflow.','feature',308),
('branch-menu-control','Branch Menu Control','🗂️','Enterprise','Branch-specific availability, pricing and publishing.','feature',309),
('payment-settings','Payment Settings','💳','Payments','Restaurant payment-method enable/disable controls.','feature',310),
('pos-audit','POS Audit Trail','🛡️','Security','Bill, discount, refund, void and operational audit trail.','feature',311)
on conflict(code) do update set name=excluded.name,icon=excluded.icon,category=excluded.category,description=excluded.description,kind=excluded.kind,sort_order=excluded.sort_order;

insert into public.restaurant_plugins(
  restaurant_id,plugin_code,plugin_slug,enabled,config,display_name,category,description,feature_kind
)
select r.id,c.code,c.code,false,'{}'::jsonb,c.name,c.category,c.description,c.kind
from public.restaurants r cross join public.plugin_catalog c
where c.code in (
  'offline-billing','feedback-reviews','delivery-otp','menu-variants',
  'discount-engine','kot-routing','ebill','scan-pay',
  'branch-menu-control','payment-settings','pos-audit'
)
and not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id=r.id and rp.plugin_code=c.code
);
