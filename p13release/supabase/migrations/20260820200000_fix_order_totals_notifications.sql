-- Fix POS order totals and notification amounts.
-- New POS orders now write total_amount directly; this trigger also refreshes
-- the notification when total_amount is finalized/changed.
create or replace function public.create_order_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_total text;
  v_message text;
begin
  v_source := coalesce(
    nullif(trim(new.source_label), ''),
    initcap(replace(coalesce(new.source_type, 'order'), '_', ' ')),
    'New order'
  );

  v_total := '₹' || to_char(coalesce(new.total_amount, 0), 'FM999,999,999,990.00');

  v_message := format(
    '%s • Order #%s • %s',
    v_source,
    left(new.id::text, 8),
    v_total
  );

  update public.notifications
  set
    message = v_message,
    title = 'New order received',
    action_url = '/kitchen'
  where restaurant_id = new.restaurant_id
    and type in ('order','success')
    and message like format('%%%s%%', left(new.id::text, 8));

  if not found then
    insert into public.notifications (
      restaurant_id, user_id, type, title, message, action_url
    ) values (
      new.restaurant_id,
      null,
      'order',
      'New order received',
      v_message,
      '/kitchen'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_order on public.orders;

create trigger trg_notify_new_order
after insert or update of total_amount on public.orders
for each row
when (new.restaurant_id is not null)
execute function public.create_order_notification();



-- Repair historical orders whose total_amount was left at zero by the old POS
-- flow, using the item line totals that were already saved.
with totals as (
  select
    oi.order_id,
    sum(
      coalesce(
        oi.line_total,
        coalesce(oi.unit_price, 0) * coalesce(oi.quantity, 0)
      )
    ) as total
  from public.order_items oi
  group by oi.order_id
)
update public.orders o
set
  subtotal = coalesce(nullif(o.subtotal, 0), totals.total),
  total_amount = coalesce(nullif(o.total_amount, 0), totals.total)
from totals
where o.id = totals.order_id
  and coalesce(o.total_amount, 0) = 0
  and totals.total > 0;

-- Backfill existing order notifications so old zero amounts are corrected
-- from the persisted order total when available.
update public.notifications n
set message = regexp_replace(
  n.message,
  '₹[0-9,]+(\.[0-9]+)?',
  '₹' || to_char(coalesce(o.total_amount, 0), 'FM999,999,999,990.00')
)
from public.orders o
where n.type in ('order','success')
  and n.message like format('%%%s%%', left(o.id::text, 8))
  and coalesce(o.total_amount, 0) > 0;
