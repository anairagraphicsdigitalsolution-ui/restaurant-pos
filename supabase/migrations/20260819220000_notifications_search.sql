-- Real-time order notifications + searchable notification stream.

create or replace function public.create_order_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_total text;
begin
  v_source := coalesce(nullif(trim(new.source_label), ''), initcap(replace(coalesce(new.source_type, 'order'), '_', ' ')), 'New order');
  v_total := '₹' || to_char(coalesce(new.total_amount, 0), 'FM999,999,999,990.00');

  insert into public.notifications (
    restaurant_id,
    user_id,
    type,
    title,
    message,
    action_url
  ) values (
    new.restaurant_id,
    null,
    'success',
    'New order received',
    format('%s • %s', v_source, v_total),
    '/kitchen'
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_new_order on public.orders;
create trigger trg_notify_new_order
after insert on public.orders
for each row
when (new.restaurant_id is not null)
execute function public.create_order_notification();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when undefined_object then
  null;
end $$;

create index if not exists idx_menu_items_restaurant_name on public.menu_items(restaurant_id, name);
create index if not exists idx_orders_restaurant_created_at on public.orders(restaurant_id, created_at desc);
create index if not exists idx_customers_restaurant_name on public.customers(restaurant_id, name);
create index if not exists idx_reservations_restaurant_created_at on public.reservations(restaurant_id, created_at desc);
create index if not exists idx_offers_restaurant_title on public.offers(restaurant_id, title);
