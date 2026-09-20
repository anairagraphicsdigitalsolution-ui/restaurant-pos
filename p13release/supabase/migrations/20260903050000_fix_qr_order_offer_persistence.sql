-- Persist the offer discount on QR/table/room orders before delivery/billing/printing.
-- Without this, the QR order RPC calculated the discount for its response but
-- left orders.discount_amount at 0, causing delivery slips to print full price.
DO $$
DECLARE
  v_def text;
  v_pos integer;
  v_insert text := E'\n  UPDATE public.orders\n  SET subtotal = v_subtotal,\n      discount_amount = round(v_discount,2),\n      total_amount = round(v_subtotal-v_discount,2),\n      offer_id = v_offer.id\n  WHERE id = v_order_id;\n\n';
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_public_qr_order'
    AND pg_get_function_identity_arguments(p.oid) = 'p_slug text, p_type text, p_source_id uuid, p_items jsonb, p_overall_note text, p_offer_id text'
  LIMIT 1;
  IF v_def IS NULL THEN RAISE EXCEPTION 'create_public_qr_order function not found'; END IF;
  v_pos := position('RETURN jsonb_build_object' in v_def);
  IF v_pos = 0 THEN RAISE EXCEPTION 'QR order return block not found'; END IF;
  IF position('SET discount_amount = round(v_discount,2)' in v_def) > 0 THEN RETURN; END IF;
  v_def := left(v_def, v_pos - 1) || v_insert || substring(v_def from v_pos);
  EXECUTE v_def;
END $$;
