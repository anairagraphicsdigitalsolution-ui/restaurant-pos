-- Anaira POS performance indexes
-- Safe additive indexes for the existing restaurant-scoped architecture.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created_at
  ON public.orders (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status
  ON public.orders (restaurant_id, status);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_category
  ON public.menu_items (restaurant_id, category);

CREATE INDEX IF NOT EXISTS idx_inventory_restaurant_low_stock
  ON public.inventory (restaurant_id, quantity, min_stock);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id
  ON public.tables (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_rooms_restaurant_id
  ON public.rooms (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_start
  ON public.reservations (restaurant_id, reservation_start_at);
