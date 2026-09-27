-- Dashboard performance V2: aggregate reporting in PostgreSQL instead of
-- downloading hundreds of order_items into the Electron renderer.
-- This migration is read-only with respect to business data: it creates
-- functions only and does not UPDATE/DELETE/TRUNCATE any existing rows.

CREATE OR REPLACE FUNCTION public.get_dashboard_sales_summary(
  p_restaurant_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(day_key date, total_sales numeric, order_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (o.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day_key,
    COALESCE(SUM(COALESCE(o.total_amount, 0)), 0)::numeric AS total_sales,
    COUNT(*)::bigint AS order_count
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at >= p_start
    AND o.created_at < p_end
    AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','canceled','void','voided','refunded')
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_top_items(
  p_restaurant_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_limit integer DEFAULT 6
)
RETURNS TABLE(item_name text, quantity numeric, sales_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(BTRIM(oi.item_name), ''), 'Unknown item') AS item_name,
    COALESCE(SUM(COALESCE(oi.quantity, 0)), 0)::numeric AS quantity,
    COALESCE(SUM(COALESCE(oi.line_total, COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 0))), 0)::numeric AS sales_amount
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at >= p_start
    AND o.created_at < p_end
    AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','canceled','void','voided','refunded')
  GROUP BY 1
  ORDER BY quantity DESC, sales_amount DESC, item_name ASC
  LIMIT GREATEST(COALESCE(p_limit, 6), 1);
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_sales_summary(uuid,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_top_items(uuid,timestamptz,timestamptz,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_sales_summary(uuid,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_top_items(uuid,timestamptz,timestamptz,integer) TO service_role;
