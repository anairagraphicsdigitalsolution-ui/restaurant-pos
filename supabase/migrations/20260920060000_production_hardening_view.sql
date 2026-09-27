-- Anaira production hardening: payment summary view must execute as invoker
-- so underlying order_payments RLS remains effective for authenticated users.
create or replace view public.restaurant_daily_payment_summary
with (security_invoker=true)
as
select restaurant_id,
       date_trunc('day', paid_at)::date as sale_date,
       sum(case when payment_method='cash' and status='paid' then amount else 0::numeric end) as cash_sales,
       sum(case when payment_method='card' and status='paid' then amount else 0::numeric end) as card_sales,
       sum(case when payment_method='upi' and status='paid' then amount else 0::numeric end) as upi_sales,
       sum(case when payment_method not in ('cash','card','upi') and status='paid' then amount else 0::numeric end) as other_sales,
       sum(case when status='paid' then amount else 0::numeric end) as total_paid,
       sum(case when status='refunded' then amount else 0::numeric end) as total_refunded
from public.order_payments
 group by restaurant_id, date_trunc('day', paid_at)::date;
