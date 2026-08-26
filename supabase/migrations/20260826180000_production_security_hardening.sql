-- Production security hardening.
-- Privileged SECURITY DEFINER functions must not be directly callable by anon.
-- Public QR/website functions are invoked by server-side service_role routes.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.admin_can_change_operational_settings(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_save_restaurant_theme(uuid,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_combo_feature_switch() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_closed_cash_closing_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reopen_cash_closing(uuid,date,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_order_payment_state_from_ledger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_public_website_order(text,text,uuid,jsonb,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_qr_context(text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_rating_summary(uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.admin_can_change_operational_settings(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_public_qr_order(text,text,uuid,jsonb,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_public_website_order(text,text,uuid,jsonb,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_qr_context(text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_rating_summary(uuid) FROM authenticated;

ALTER FUNCTION public.app_today() SET search_path = public;
ALTER FUNCTION public.app_now() SET search_path = public;

COMMIT;
