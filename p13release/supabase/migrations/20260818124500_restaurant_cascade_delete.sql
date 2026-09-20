-- Production-safe Super Admin restaurant deletion.
-- Deletes restaurant-scoped application data in dependency order and then
-- removes any remaining public tables that explicitly carry restaurant_id.

CREATE OR REPLACE FUNCTION public.delete_restaurant_cascade(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_count bigint := 0;
  v_total bigint := 0;
  v_table record;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  -- Deep child records first.
  DELETE FROM public.item_ingredients
  WHERE menu_item_id IN (
    SELECT id FROM public.menu_items WHERE restaurant_id = p_restaurant_id
  )
  OR inventory_id IN (
    SELECT id FROM public.inventory WHERE restaurant_id = p_restaurant_id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.order_items
  WHERE order_id IN (
    SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id
  )
  OR item_id IN (
    SELECT id FROM public.menu_items WHERE restaurant_id = p_restaurant_id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.stock_usage WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.inventory_transactions WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.audit_logs WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.plugin_logs WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.reservations WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.orders WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.offers WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.restaurant_banners WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.restaurant_plugins WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.plugin_settings WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.plugins WHERE restaurant_id = p_restaurant_id::text;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.invoice_sequences WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.menu_items WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.inventory WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.tables WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  DELETE FROM public.rooms WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  -- Remove restaurant-linked user profiles. The auth users themselves are
  -- intentionally cleaned by the protected Next.js API after this function,
  -- so an auth user shared by multiple restaurants is never deleted here.
  DELETE FROM public.profiles WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  -- Catch future/current restaurant-scoped tables that were not explicitly
  -- listed above. This keeps the deletion comprehensive as the SaaS grows.
  FOR v_table IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'restaurant_id'
      AND table_name <> 'restaurants'
      AND table_name NOT IN (
        'item_ingredients','order_items','stock_usage','inventory_transactions',
        'audit_logs','plugin_logs','reservations','orders','offers',
        'restaurant_banners','restaurant_plugins','plugin_settings','plugins',
        'invoice_sequences','menu_items','inventory','tables','rooms','profiles'
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name = columns.table_name
          AND t.table_type = 'BASE TABLE'
      )
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE restaurant_id = $1', v_table.table_name)
      USING p_restaurant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  END LOOP;

  DELETE FROM public.restaurants WHERE id = p_restaurant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

  RETURN jsonb_build_object(
    'success', true,
    'restaurant_id', p_restaurant_id,
    'deleted_rows', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_restaurant_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_restaurant_cascade(uuid) TO service_role;
