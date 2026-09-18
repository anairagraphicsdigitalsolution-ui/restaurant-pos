-- Anaira POS safe performance cleanup.
-- IMPORTANT: no business tables/data are deleted or modified here.
-- This migration only removes an exact duplicate index and adds a narrow
-- lookup index used by auth/profile checks. Both operations are idempotent.

DROP INDEX IF EXISTS public.idx_restaurant_service_calls_restaurant_order_open;

CREATE INDEX IF NOT EXISTS idx_profiles_id_restaurant_role
  ON public.profiles (id, restaurant_id, role);

ANALYZE public.profiles;
ANALYZE public.orders;
ANALYZE public.order_items;
ANALYZE public.notifications;
ANALYZE public.restaurant_plugins;
ANALYZE public.plugin_settings;
ANALYZE public.restaurant_service_calls;
