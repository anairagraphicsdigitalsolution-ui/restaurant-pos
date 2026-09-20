-- Run after: npx supabase db push
-- Read-only verification. No INSERT/UPDATE/DELETE.

SELECT
  'award_loyalty_for_order' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='award_loyalty_for_order'
      AND pg_get_function_identity_arguments(p.oid)=''
  ) AS ok
UNION ALL
SELECT
  'stage3_finalize_order actor overload',
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='stage3_finalize_order'
      AND pg_get_function_identity_arguments(p.oid)
        = 'p_actor_id uuid, p_order_id uuid, p_payment_method text, p_paid_amount numeric, p_offer_id uuid'
  )
UNION ALL
SELECT
  'sync_order_payment_totals',
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='sync_order_payment_totals'
      AND pg_get_function_identity_arguments(p.oid)='p_order_id uuid'
  )
UNION ALL
SELECT
  'payment sync trigger',
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname='order_payments'
      AND t.tgname='trg_order_payments_sync_totals'
      AND NOT t.tgisinternal
  )
UNION ALL
SELECT
  'refund sync trigger',
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname='order_refunds'
      AND t.tgname='trg_order_refunds_sync_totals'
      AND NOT t.tgisinternal
  );

-- Show recent orders with an actual outstanding balance.
SELECT
  o.id,
  o.invoice_no,
  o.subtotal,
  o.discount_amount,
  o.tax_amount,
  o.total_amount,
  o.paid_amount,
  o.payment_status,
  o.offer_id,
  ROUND(GREATEST(COALESCE(o.total_amount,0)-COALESCE(o.paid_amount,0),0),2) AS pending_balance
FROM public.orders o
ORDER BY o.created_at DESC
LIMIT 25;
