-- Anaira POS Phase 5: Cloud schema lint fixes
-- Base: phase5-cli1150-clean-status-fixed
--
-- Fixes the three blocking public-schema errors reported by:
--   supabase db lint --db-url "$env:SUPABASE_CLOUD_DB_URL" --schema public
--
-- 1) set_whatsapp_config: plugin_settings uses plugin_code, not plugin_slug,
--    and has no unique constraint on (restaurant_id, plugin_code), so use
--    update-then-insert instead of ON CONFLICT on nonexistent key.
--
-- 2) issue_order_token: token_no is integer on the current cloud schema;
--    cast it to text before regexp_replace.
--
-- 3) stage3_finalize_order legacy 4-arg wrapper: the database has longer
--    overloads with defaults, making a 5-argument positional call ambiguous.
--    Call the canonical 8-argument billing function explicitly with all args.
--
-- No application tables are dropped or reset.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_whatsapp_config(
  p_restaurant_id uuid,
  p_number text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.plugin_settings
  SET config = jsonb_build_object('number', p_number)
  WHERE restaurant_id = p_restaurant_id
    AND plugin_code = 'whatsapp';

  IF NOT FOUND THEN
    INSERT INTO public.plugin_settings (
      restaurant_id,
      plugin_code,
      config
    )
    VALUES (
      p_restaurant_id,
      'whatsapp',
      jsonb_build_object('number', p_number)
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.issue_order_token(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_token_type text DEFAULT 'pickup'::text,
  p_display_name text DEFAULT NULL::text
)
RETURNS public.order_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v public.order_tokens%ROWTYPE;
  n integer;
BEGIN
  IF NOT public.is_restaurant_member(p_restaurant_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(
           MAX(
             NULLIF(
               regexp_replace(token_no::text, '[^0-9]', '', 'g'),
               ''
             )::integer
           ),
           0
         ) + 1
    INTO n
  FROM public.order_tokens
  WHERE restaurant_id = p_restaurant_id
    AND token_type = p_token_type
    AND created_at::date = current_date;

  INSERT INTO public.order_tokens (
    restaurant_id,
    order_id,
    token_no,
    token_type,
    display_name
  )
  VALUES (
    p_restaurant_id,
    p_order_id,
    upper(left(p_token_type, 1)) || lpad(n::text, 3, '0'),
    p_token_type,
    p_display_name
  )
  RETURNING * INTO v;

  RETURN v;
END;
$function$;

-- Keep the legacy 4-argument API intact, but route it unambiguously to the
-- current canonical 8-argument billing implementation.
CREATE OR REPLACE FUNCTION public.stage3_finalize_order(
  p_order_id uuid,
  p_payment_method text DEFAULT 'cash'::text,
  p_paid_amount numeric DEFAULT 0,
  p_offer_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile record;
BEGIN
  SELECT *
    INTO v_profile
  FROM public.stage3_current_profile();

  IF v_profile.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN public.stage3_finalize_order(
    v_profile.user_id::uuid,
    p_order_id::uuid,
    p_payment_method::text,
    p_paid_amount::numeric,
    p_offer_id::uuid,
    NULL::uuid,
    0::numeric,
    'amount'::text
  );
END;
$function$;

COMMIT;
