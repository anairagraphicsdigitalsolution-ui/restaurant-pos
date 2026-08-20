-- Anaira non-inventory Petpooja parity completion.
-- Additive only. Inventory tables are intentionally not touched.

create table if not exists public.central_kitchens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  address text,
  created_at timestamptz not null default now(),
  unique(restaurant_id, code)
);

create table if not exists public.kitchen_dispatches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kitchen_id uuid not null references public.central_kitchens(id) on delete cascade,
  branch_id uuid,
  reference text,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  dispatched_at timestamptz,
  received_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  forecast_date date not null,
  metric text not null,
  predicted_value numeric not null default 0,
  confidence numeric,
  source text not null default 'anaira',
  created_at timestamptz not null default now(),
  unique(restaurant_id, forecast_date, metric)
);

create table if not exists public.dynamic_report_definitions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  report_type text not null,
  filters jsonb not null default '{}'::jsonb,
  columns_config jsonb not null default '[]'::jsonb,
  schedule text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.e_bill_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid,
  invoice_no text,
  document_type text not null default 'invoice',
  delivery_channel text not null default 'download',
  recipient text,
  status text not null default 'generated',
  document_url text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.printer_devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  printer_type text not null default 'thermal',
  ip_address text,
  port integer default 9100,
  station_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_gateway_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  display_name text not null,
  active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, provider)
);

create table if not exists public.sms_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  campaign_id uuid,
  customer_id uuid,
  phone text,
  status text not null default 'queued',
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.website_order_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  slug text,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(restaurant_id)
);

create table if not exists public.scan_pay_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid,
  amount numeric not null default 0,
  payment_method text,
  status text not null default 'pending',
  reference text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_central_kitchens_restaurant on public.central_kitchens(restaurant_id);
create index if not exists idx_kitchen_dispatches_restaurant on public.kitchen_dispatches(restaurant_id,created_at desc);
create index if not exists idx_forecast_snapshots_restaurant on public.forecast_snapshots(restaurant_id,forecast_date desc);
create index if not exists idx_dynamic_reports_restaurant on public.dynamic_report_definitions(restaurant_id,updated_at desc);
create index if not exists idx_ebill_documents_restaurant on public.e_bill_documents(restaurant_id,created_at desc);
create index if not exists idx_printer_devices_restaurant on public.printer_devices(restaurant_id);
create index if not exists idx_payment_gateway_configs_restaurant on public.payment_gateway_configs(restaurant_id);
create index if not exists idx_sms_deliveries_restaurant on public.sms_campaign_deliveries(restaurant_id,created_at desc);
create index if not exists idx_scan_pay_requests_restaurant on public.scan_pay_requests(restaurant_id,created_at desc);

do $$
declare
  t record;
begin
  for t in
    select v.table_name
    from (
      values
        ('central_kitchens'),
        ('kitchen_dispatches'),
        ('forecast_snapshots'),
        ('dynamic_report_definitions'),
        ('e_bill_documents'),
        ('printer_devices'),
        ('payment_gateway_configs'),
        ('sms_campaign_deliveries'),
        ('website_order_settings'),
        ('scan_pay_requests')
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
      'restaurant scoped ' || t.table_name,
      t.table_name
    );

    execute format(
      'create policy %I on public.%I
       for all
       using (public.is_restaurant_member(restaurant_id))
       with check (public.is_restaurant_member(restaurant_id))',
      'restaurant scoped ' || t.table_name,
      t.table_name
    );
  end loop;
end $$;
