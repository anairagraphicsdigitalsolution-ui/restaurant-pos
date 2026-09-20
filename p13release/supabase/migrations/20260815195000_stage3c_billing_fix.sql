BEGIN;

-- Stage 3C billing fix (corrected)
-- Stage 3B already created these functions with the parameter order:
--   stage3_consume_order_inventory(p_actor_id uuid, p_order_id uuid)
--   stage3_finalize_order(p_actor_id uuid, p_order_id uuid, ...)
-- Do not recreate them with reversed parameter names/order.

REVOKE ALL ON FUNCTION public.stage3_consume_order_inventory(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage3_consume_order_inventory(uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.stage3_finalize_order(uuid, uuid, text, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage3_finalize_order(uuid, uuid, text, numeric, uuid)
  TO authenticated;

COMMIT;
