BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_restaurant_deliveries_restaurant_slip_no
  ON public.restaurant_deliveries (restaurant_id, slip_no)
  WHERE slip_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_delivery_slip_no(p_restaurant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('anaira:delivery-slip:' || p_restaurant_id::text));

  SELECT COALESCE(MAX((regexp_replace(slip_no, '[^0-9]', '', 'g'))::integer), 0) + 1
    INTO v_next
  FROM public.restaurant_deliveries
  WHERE restaurant_id = p_restaurant_id
    AND slip_no ~ '^DL-[0-9]+$';

  RETURN 'DL-' || lpad(v_next::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_delivery_slip_no(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_delivery_slip_no(uuid) TO authenticated;

COMMIT;
