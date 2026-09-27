-- Delivery + Takeaway workflow expansion.
-- Non-destructive: only adds defaulted columns, indexes and a safe policy refresh.

alter table public.restaurant_deliveries
  add column if not exists slip_no text,
  add column if not exists order_mode text default 'delivery',
  add column if not exists rider_id uuid,
  add column if not exists payment_method text default 'cash',
  add column if not exists expected_amount numeric default 0,
  add column if not exists cash_collected numeric default 0,
  add column if not exists upi_collected numeric default 0,
  add column if not exists card_collected numeric default 0,
  add column if not exists settlement_status text default 'pending',
  add column if not exists settlement_difference numeric default 0,
  add column if not exists assigned_at timestamptz,
  add column if not exists out_for_delivery_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists settled_at timestamptz,
  add column if not exists settled_by uuid,
  add column if not exists customer_notes text;

alter table public.orders
  add column if not exists order_mode text default 'dine_in';

create index if not exists idx_restaurant_deliveries_status
  on public.restaurant_deliveries(restaurant_id,status,created_at desc);

create index if not exists idx_restaurant_deliveries_rider
  on public.restaurant_deliveries(restaurant_id,rider_id,status);

create index if not exists idx_restaurant_deliveries_slip
  on public.restaurant_deliveries(restaurant_id,slip_no);

create or replace function public.next_delivery_slip_no(p_restaurant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  select coalesce(max((regexp_replace(slip_no, '[^0-9]', '', 'g'))::integer),0) + 1
    into v_next
  from public.restaurant_deliveries
  where restaurant_id = p_restaurant_id
    and slip_no ~ '^DL-[0-9]+$';

  return 'DL-' || lpad(v_next::text, 5, '0');
end;
$$;

alter table public.restaurant_deliveries enable row level security;
drop policy if exists "restaurant members deliveries" on public.restaurant_deliveries;
create policy "restaurant members deliveries"
on public.restaurant_deliveries
for all
using (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()))
with check (restaurant_id = (select restaurant_id from public.profiles where id = auth.uid()));
