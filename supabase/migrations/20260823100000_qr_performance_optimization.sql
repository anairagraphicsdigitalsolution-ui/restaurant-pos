BEGIN;

-- Fast aggregate for public QR rating summary. This avoids transferring
-- hundreds of feedback rows on every QR menu request.
CREATE OR REPLACE FUNCTION public.get_public_rating_summary(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'average', COALESCE(ROUND(AVG(rating)::numeric, 1), 0),
    'count', COUNT(*)
  )
  FROM public.customer_feedback
  WHERE restaurant_id = p_restaurant_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_rating_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_rating_summary(uuid) TO service_role;

COMMIT;
