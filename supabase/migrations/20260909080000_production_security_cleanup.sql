-- Anaira SaaS production security/performance cleanup.
-- Idempotent: only removes redundant API EXECUTE grants and duplicate indexes.

REVOKE EXECUTE ON FUNCTION public.sync_marketing_attribution_from_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_order_payment_state_from_ledger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_platform_marketing_subscription() FROM PUBLIC, anon, authenticated;

DROP INDEX IF EXISTS public.ux_invoice_sequences_restaurant_id;
DROP INDEX IF EXISTS public.platform_marketing_message_events_idempotency_idx;
DROP INDEX IF EXISTS public.idx_restaurant_plugins_restaurant_plugin_enabled;
DROP INDEX IF EXISTS public.idx_rooms_restaurant_room_number;
DROP INDEX IF EXISTS public.idx_staff_permissions_staff;
DROP INDEX IF EXISTS public.idx_tables_restaurant_table_number;
