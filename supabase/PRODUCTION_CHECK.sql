-- ANAIRA POS PRODUCTION CHECK
-- Run in Supabase SQL Editor after applying the repair migration.

-- 1) Billing / finalize functions
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'stage3_finalize_order',
    'sync_order_payment_totals',
    'award_loyalty_for_order',
    'preview_order_offers',
    'calculate_offer_discount'
  )
ORDER BY p.proname, arguments;

-- 2) Loyalty trigger
SELECT
  tgname,
  tgenabled,
  pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_award_loyalty_for_order';

-- 3) Payment ledger triggers
SELECT
  tgname,
  pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid IN (
  'public.order_payments'::regclass,
  'public.order_refunds'::regclass
)
AND NOT tgisinternal;

-- 4) Storage buckets
SELECT id, name, public
FROM storage.buckets
WHERE id IN ('logos','menu-images','restaurant-covers')
ORDER BY id;

-- 5) Current restaurant profile links
SELECT id, restaurant_id, role
FROM public.profiles
WHERE restaurant_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;

-- 6) Recent billing records
SELECT
  id,
  restaurant_id,
  customer_id,
  subtotal,
  discount_amount,
  tax_amount,
  total_amount,
  paid_amount,
  payment_status,
  offer_id,
  invoice_no,
  billed_at
FROM public.orders
ORDER BY created_at DESC
LIMIT 20;

-- 7) Recent loyalty earnings
SELECT
  lt.id,
  lt.customer_id,
  lt.order_id,
  lt.points,
  lt.transaction_type,
  lt.created_at
FROM public.loyalty_transactions lt
WHERE lt.transaction_type = 'earn'
ORDER BY lt.created_at DESC
LIMIT 20;
