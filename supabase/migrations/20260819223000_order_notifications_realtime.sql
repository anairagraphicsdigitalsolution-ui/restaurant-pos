-- Order notifications: create a restaurant notification as soon as an order reaches the orders table.
-- This covers QR orders, POS orders, and any other order creation path without relying on the UI.

create index if not exists idx_notifications_restaurant_created_at
  on public.notifications(restaurant_id, created_at desc);

create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_name text;
  order_source text;
  order_total text;
begin
  select r.name into restaurant_name
  from public.restaurants r
  where r.id = NEW.restaurant_id;

  order_source := coalesce(nullif(NEW.source_label, ''), initcap(coalesce(NEW.source_type, 'order')));
  order_total := to_char(coalesce(NEW.total_amount, 0), 'FM999999990.00');

  insert into public.notifications (
    restaurant_id,
    type,
    title,
    message,
    action_url
  )
  values (
    NEW.restaurant_id,
    'order',
    'New order received',
    format('%s • Order #%s • ₹%s', order_source, left(NEW.id::text, 8), order_total),
    '/kitchen'
  );

  return NEW;
end;
$$;

drop trigger if exists trg_notify_new_order on public.orders;

create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_source text;
  order_total text;
  notification_exists boolean;
begin
  order_source := coalesce(nullif(NEW.source_label, ''), initcap(coalesce(NEW.source_type, 'order')));
  order_total := to_char(coalesce(NEW.total_amount, 0), 'FM999999990.00');

  select exists(
    select 1
    from public.notifications n
    where n.restaurant_id = NEW.restaurant_id
      and n.type = 'order'
      and n.message like format('%%%s%%', left(NEW.id::text, 8))
  ) into notification_exists;

  if not notification_exists then
    insert into public.notifications (
      restaurant_id, type, title, message, action_url
    ) values (
      NEW.restaurant_id,
      'order',
      'New order received',
      format('%s • Order #%s • ₹%s', order_source, left(NEW.id::text, 8), order_total),
      '/kitchen'
    );
  end if;

  return NEW;
end;
$$;

create trigger trg_notify_new_order
after insert or update of total_amount on public.orders
for each row execute function public.notify_new_order();

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
  end;
end $$;

