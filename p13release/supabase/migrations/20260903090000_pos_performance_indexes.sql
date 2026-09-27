-- Anaira POS performance indexes.
-- These are tenant-scoped composite indexes matching the hottest Electron/POS queries.

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_date_time
  ON public.reservations (restaurant_id, date, time);

CREATE INDEX IF NOT EXISTS idx_offers_restaurant_created_at
  ON public.offers (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_table_number
  ON public.tables (restaurant_id, table_number);

CREATE INDEX IF NOT EXISTS idx_rooms_restaurant_room_number
  ON public.rooms (restaurant_id, room_number);

CREATE INDEX IF NOT EXISTS idx_menu_variants_restaurant_active_created
  ON public.menu_variants (restaurant_id, active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plugin_settings_restaurant_plugin
  ON public.plugin_settings (restaurant_id, plugin_code);

CREATE INDEX IF NOT EXISTS idx_restaurant_plugins_restaurant_plugin_enabled
  ON public.restaurant_plugins (restaurant_id, plugin_code, enabled);

CREATE INDEX IF NOT EXISTS idx_staff_permissions_restaurant_staff
  ON public.staff_permissions (restaurant_id, staff_id);

CREATE INDEX IF NOT EXISTS idx_notifications_unread_restaurant
  ON public.notifications (restaurant_id, created_at DESC)
  WHERE read_at IS NULL;
