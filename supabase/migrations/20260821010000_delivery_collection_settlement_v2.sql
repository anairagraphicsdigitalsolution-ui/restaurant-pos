-- Anaira delivery collection + settlement v2.
-- Non-destructive. Adds an explicit COD collection lifecycle and supports
-- rider OR restaurant-owner delivery without deleting existing data.

alter table public.restaurant_deliveries
  add column if not exists delivery_person_type text default 'rider',
  add column if not exists delivery_person_name text,
  add column if not exists delivery_person_phone text,
  add column if not exists collection_status text default 'not_required',
  add column if not exists collection_expected numeric(14,2) default 0,
  add column if not exists collection_received numeric(14,2) default 0,
  add column if not exists collection_difference numeric(14,2) default 0,
  add column if not exists collection_received_by uuid,
  add column if not exists collection_received_at timestamptz,
  add column if not exists collection_notes text,
  add column if not exists settlement_method text;

update public.restaurant_deliveries
set
  delivery_person_type = case
    when rider_id is not null then 'rider'
    else coalesce(delivery_person_type, 'rider')
  end,
  delivery_person_name = coalesce(delivery_person_name, rider_name),
  delivery_person_phone = coalesce(delivery_person_phone, rider_phone),
  collection_expected = coalesce(collection_expected, expected_amount, 0),
  collection_received = coalesce(collection_received, cash_collected + upi_collected + card_collected, 0),
  collection_difference = coalesce(
    collection_difference,
    (cash_collected + upi_collected + card_collected) - coalesce(expected_amount, 0),
    0
  ),
  collection_status = case
    when coalesce(settlement_status, 'pending') = 'settled' then 'settled'
    when lower(coalesce(payment_method, 'cash')) in ('cash','cod') then
      case
        when status in ('delivered','picked_up') then 'pending_settlement'
        else 'pending_collection'
      end
    else 'not_required'
  end
where true;

create index if not exists idx_restaurant_deliveries_collection
  on public.restaurant_deliveries(restaurant_id, collection_status, created_at desc);

create index if not exists idx_restaurant_deliveries_person
  on public.restaurant_deliveries(restaurant_id, delivery_person_type, status);

drop policy if exists "restaurant members deliveries v2" on public.restaurant_deliveries;
create policy "restaurant members deliveries v2"
on public.restaurant_deliveries
for all
using (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
)
with check (
  restaurant_id = (select restaurant_id from public.profiles where id = auth.uid())
);
