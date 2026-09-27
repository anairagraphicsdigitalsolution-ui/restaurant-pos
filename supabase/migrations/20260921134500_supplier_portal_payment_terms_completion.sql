CREATE OR REPLACE FUNCTION public.p1_10_submit_rfq_quote(
  p_rfq_id uuid,p_supplier_id uuid,p_items jsonb,p_valid_until date,p_delivery_days integer,p_notes text,p_payment_terms_days integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $function$
DECLARE v_result jsonb; v_quote_id uuid;
BEGIN
  v_result := public.p1_10_submit_rfq_quote(p_rfq_id,p_supplier_id,p_items,p_valid_until,p_delivery_days,p_notes);
  v_quote_id := (v_result->>'quote_id')::uuid;
  UPDATE public.supplier_rfq_quotes SET payment_terms_days=GREATEST(COALESCE(p_payment_terms_days,0),0) WHERE id=v_quote_id;
  RETURN v_result || jsonb_build_object('payment_terms_days',GREATEST(COALESCE(p_payment_terms_days,0),0));
END;
$function$;
