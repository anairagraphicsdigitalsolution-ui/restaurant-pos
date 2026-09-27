-- ============================================================
-- STAGE 1 — PRODUCTION DATABASE SECURITY HARDENING
-- Restaurant POS / SaaS
--
-- Purpose:
--   1) Enable RLS on every public business table.
--   2) Remove the current "allow all" policies.
--   3) Enforce restaurant isolation for authenticated users.
--   4) Keep the existing public QR-menu reads working for now.
--   5) Keep anonymous QR order INSERT working, but validate the
--      restaurant, table/room and menu item relationship.
--   6) Remove client access to internal plugin/config/log tables.
--
-- IMPORTANT:
--   Run this migration AFTER confirming the current schema backup
--   exists. This migration does NOT delete business data.
--
-- NEXT STAGE:
--   Customer QR ordering will later be moved to a server/RPC
--   boundary so public SELECT access to tables/rooms can be reduced.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Helper functions
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_restaurant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.restaurant_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'super_admin', false);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'super_admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('staff', 'admin', 'super_admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.is_restaurant_member(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR (
      p_restaurant_id IS NOT NULL
      AND public.current_restaurant_id() = p_restaurant_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_restaurant(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR (
      public.current_user_role() = 'admin'
      AND public.current_restaurant_id() = p_restaurant_id
    );
$$;

-- These helpers are used by RLS policies.
GRANT EXECUTE ON FUNCTION public.current_restaurant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_restaurant(uuid) TO authenticated;

DO $$ BEGIN IF to_regprocedure('public.current_restaurant_id()') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.current_restaurant_id() FROM anon'; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.current_user_role()') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon'; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.is_super_admin()') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon'; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.is_admin()') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon'; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.is_staff_or_admin()') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.is_staff_or_admin() FROM anon'; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.is_restaurant_member(uuid)') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.is_restaurant_member(uuid) FROM anon'; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.can_manage_restaurant(uuid)') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.can_manage_restaurant(uuid) FROM anon'; END IF; END $$;
-- ------------------------------------------------------------
-- 2. Remove the existing permissive policies
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Allow all" ON public.plugin_settings;
DROP POLICY IF EXISTS "Allow all for now" ON public.plugins;
DROP POLICY IF EXISTS "Public can view menu" ON public.menu_items;
DROP POLICY IF EXISTS "Public can view restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Public can view rooms" ON public.rooms;
DROP POLICY IF EXISTS "Public can view tables" ON public.tables;
DROP POLICY IF EXISTS "User based access" ON public.plugins;
DROP POLICY IF EXISTS "allow" ON public.profiles;
DROP POLICY IF EXISTS "anon_insert_items" ON public.order_items;
DROP POLICY IF EXISTS "anon_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "auth_delete_items" ON public.order_items;
DROP POLICY IF EXISTS "auth_delete_orders" ON public.orders;
DROP POLICY IF EXISTS "auth_insert_items" ON public.order_items;
DROP POLICY IF EXISTS "auth_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "auth_select_items" ON public.order_items;
DROP POLICY IF EXISTS "auth_select_orders" ON public.orders;
DROP POLICY IF EXISTS "delete_menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "insert_menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "inventory access" ON public.inventory;
DROP POLICY IF EXISTS "menu access" ON public.menu_items;
DROP POLICY IF EXISTS "offers access" ON public.offers;
DROP POLICY IF EXISTS "open_items_all" ON public.order_items;
DROP POLICY IF EXISTS "open_orders_all" ON public.orders;
DROP POLICY IF EXISTS "public menu" ON public.menu_items;
DROP POLICY IF EXISTS "public read" ON public.menu_items;
DROP POLICY IF EXISTS "public read" ON public.restaurants;
DROP POLICY IF EXISTS "public read" ON public.tables;
DROP POLICY IF EXISTS "public read menu" ON public.menu_items;
DROP POLICY IF EXISTS "public read restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "public read rooms" ON public.rooms;
DROP POLICY IF EXISTS "public read tables" ON public.tables;
DROP POLICY IF EXISTS "restaurants access" ON public.restaurants;
DROP POLICY IF EXISTS "rooms access" ON public.rooms;
DROP POLICY IF EXISTS "select_menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "tables access" ON public.tables;
DROP POLICY IF EXISTS "update_menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "user settings" ON public.settings;

-- ------------------------------------------------------------
-- 3. Enable RLS on every public application table
-- ------------------------------------------------------------

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plugin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plugin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. Remove direct table privileges from anonymous users.
--    Public SELECT is granted back only on intentionally public
--    QR-menu tables below.
-- ------------------------------------------------------------

REVOKE ALL ON TABLE
  public.inventory,
  public.item_ingredients,
  public.menu_items,
  public.offers,
  public.order_items,
  public.orders,
  public.plugin_logs,
  public.plugin_settings,
  public.plugins,
  public.profiles,
  public.reservations,
  public.restaurant_banners,
  public.restaurant_plugins,
  public.restaurants,
  public.rooms,
  public.settings,
  public.stock_usage,
  public.tables,
  public.users
FROM anon;

-- Re-grant only the anonymous permissions required by the current
-- QR-menu / QR-order frontend.
GRANT SELECT ON TABLE
  public.restaurants,
  public.menu_items,
  public.offers,
  public.restaurant_banners,
  public.tables,
  public.rooms
TO anon;

GRANT INSERT ON TABLE
  public.orders,
  public.order_items
TO anon;

-- Authenticated users keep table privileges; RLS is the boundary.
-- Service role remains unaffected by RLS in the normal Supabase setup.

-- ------------------------------------------------------------
-- 5. PUBLIC QR-MENU READ ACCESS
--
-- Kept temporarily because the current customer QR page directly
-- queries these tables. Stage 2 will replace this with a safer
-- public RPC/token boundary.
-- ------------------------------------------------------------

CREATE POLICY restaurants_public_read
ON public.restaurants
FOR SELECT
TO anon
USING (true);

CREATE POLICY menu_items_public_read
ON public.menu_items
FOR SELECT
TO anon
USING (true);

CREATE POLICY offers_public_read
ON public.offers
FOR SELECT
TO anon
USING (true);

CREATE POLICY restaurant_banners_public_read
ON public.restaurant_banners
FOR SELECT
TO anon
USING (true);

CREATE POLICY tables_public_read
ON public.tables
FOR SELECT
TO anon
USING (true);

CREATE POLICY rooms_public_read
ON public.rooms
FOR SELECT
TO anon
USING (true);

-- ------------------------------------------------------------
-- 6. PROFILES
-- ------------------------------------------------------------

CREATE POLICY profiles_select_self_or_superadmin
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_super_admin()
);

CREATE POLICY profiles_insert_superadmin
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY profiles_update_superadmin
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY profiles_delete_superadmin
ON public.profiles
FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- ------------------------------------------------------------
-- 7. RESTAURANTS
-- ------------------------------------------------------------

CREATE POLICY restaurants_select_authenticated_own
ON public.restaurants
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR id = public.current_restaurant_id()
);

CREATE POLICY restaurants_insert_superadmin
ON public.restaurants
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY restaurants_update_owner_or_superadmin
ON public.restaurants
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin()
  OR (
    public.current_user_role() = 'admin'
    AND owner_id = auth.uid()
    AND id = public.current_restaurant_id()
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    public.current_user_role() = 'admin'
    AND owner_id = auth.uid()
    AND id = public.current_restaurant_id()
  )
);

CREATE POLICY restaurants_delete_superadmin
ON public.restaurants
FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- ------------------------------------------------------------
-- 8. MENU ITEMS
-- ------------------------------------------------------------

CREATE POLICY menu_items_select_authenticated_own
ON public.menu_items
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY menu_items_insert_admin
ON public.menu_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_restaurant(restaurant_id)
);

CREATE POLICY menu_items_update_admin
ON public.menu_items
FOR UPDATE
TO authenticated
USING (
  public.can_manage_restaurant(restaurant_id)
)
WITH CHECK (
  public.can_manage_restaurant(restaurant_id)
);

CREATE POLICY menu_items_delete_admin
ON public.menu_items
FOR DELETE
TO authenticated
USING (
  public.can_manage_restaurant(restaurant_id)
);

-- ------------------------------------------------------------
-- 9. OFFERS
-- ------------------------------------------------------------

CREATE POLICY offers_select_authenticated_own
ON public.offers
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY offers_insert_admin
ON public.offers
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_restaurant(restaurant_id)
);

CREATE POLICY offers_update_admin
ON public.offers
FOR UPDATE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY offers_delete_admin
ON public.offers
FOR DELETE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

-- ------------------------------------------------------------
-- 10. BANNERS
-- ------------------------------------------------------------

CREATE POLICY banners_select_authenticated_own
ON public.restaurant_banners
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY banners_insert_admin
ON public.restaurant_banners
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY banners_update_admin
ON public.restaurant_banners
FOR UPDATE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY banners_delete_admin
ON public.restaurant_banners
FOR DELETE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

-- ------------------------------------------------------------
-- 11. TABLES / ROOMS
-- ------------------------------------------------------------

CREATE POLICY tables_select_authenticated_own
ON public.tables
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY tables_insert_admin
ON public.tables
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY tables_update_admin
ON public.tables
FOR UPDATE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY tables_delete_admin
ON public.tables
FOR DELETE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

CREATE POLICY rooms_select_authenticated_own
ON public.rooms
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY rooms_insert_admin
ON public.rooms
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY rooms_update_admin
ON public.rooms
FOR UPDATE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY rooms_delete_admin
ON public.rooms
FOR DELETE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

-- ------------------------------------------------------------
-- 12. ORDERS
--
-- Anonymous customer ordering remains possible, but only when:
--   * restaurant exists
--   * source_type is table/room
--   * source_id belongs to that restaurant
-- ------------------------------------------------------------

CREATE POLICY orders_anon_insert_valid_qr
ON public.orders
FOR INSERT
TO anon
WITH CHECK (
  restaurant_id IS NOT NULL
  AND lower(coalesce(status, 'pending')) = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = orders.restaurant_id
  )
  AND (
    (
      lower(coalesce(source_type, '')) = 'table'
      AND EXISTS (
        SELECT 1
        FROM public.tables t
        WHERE t.id::text = orders.source_id
          AND t.restaurant_id = orders.restaurant_id
      )
    )
    OR
    (
      lower(coalesce(source_type, '')) = 'room'
      AND EXISTS (
        SELECT 1
        FROM public.rooms rm
        WHERE rm.id::text = orders.source_id
          AND rm.restaurant_id = orders.restaurant_id
      )
    )
  )
);

CREATE POLICY orders_select_staff_admin
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR (
    public.current_user_role() IN ('staff', 'admin')
    AND restaurant_id = public.current_restaurant_id()
  )
);

CREATE POLICY orders_insert_staff_admin
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
);

CREATE POLICY orders_update_staff_admin
ON public.orders
FOR UPDATE
TO authenticated
USING (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
)
WITH CHECK (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
);

CREATE POLICY orders_delete_admin
ON public.orders
FOR DELETE
TO authenticated
USING (
  public.can_manage_restaurant(restaurant_id)
);

-- ------------------------------------------------------------
-- 13. ORDER ITEMS
-- ------------------------------------------------------------

CREATE POLICY order_items_anon_insert_valid_qr
ON public.order_items
FOR INSERT
TO anon
WITH CHECK (
  order_id IS NOT NULL
  AND item_id IS NOT NULL
  AND quantity IS NOT NULL
  AND quantity > 0
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.menu_items mi
      ON mi.id = order_items.item_id
     AND mi.restaurant_id = o.restaurant_id
    WHERE o.id = order_items.order_id
      AND lower(coalesce(o.status, 'pending')) = 'pending'
  )
);

CREATE POLICY order_items_select_staff_admin
ON public.order_items
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR (
    public.is_staff_or_admin()
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id = public.current_restaurant_id()
    )
  )
);

CREATE POLICY order_items_insert_staff_admin
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff_or_admin()
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.menu_items mi
      ON mi.id = order_items.item_id
     AND mi.restaurant_id = o.restaurant_id
    WHERE o.id = order_items.order_id
      AND (
        public.is_super_admin()
        OR o.restaurant_id = public.current_restaurant_id()
      )
  )
);

CREATE POLICY order_items_update_staff_admin
ON public.order_items
FOR UPDATE
TO authenticated
USING (
  public.is_staff_or_admin()
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        public.is_super_admin()
        OR o.restaurant_id = public.current_restaurant_id()
      )
  )
)
WITH CHECK (
  public.is_staff_or_admin()
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.menu_items mi
      ON mi.id = order_items.item_id
     AND mi.restaurant_id = o.restaurant_id
    WHERE o.id = order_items.order_id
      AND (
        public.is_super_admin()
        OR o.restaurant_id = public.current_restaurant_id()
      )
  )
);

CREATE POLICY order_items_delete_admin
ON public.order_items
FOR DELETE
TO authenticated
USING (
  public.can_manage_restaurant(
    (
      SELECT o.restaurant_id
      FROM public.orders o
      WHERE o.id = order_items.order_id
    )
  )
);

-- ------------------------------------------------------------
-- 14. INVENTORY
-- ------------------------------------------------------------

CREATE POLICY inventory_select_own
ON public.inventory
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY inventory_insert_admin
ON public.inventory
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY inventory_update_admin
ON public.inventory
FOR UPDATE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY inventory_delete_admin
ON public.inventory
FOR DELETE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

-- ------------------------------------------------------------
-- 15. STOCK USAGE
-- ------------------------------------------------------------

CREATE POLICY stock_usage_select_own
ON public.stock_usage
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY stock_usage_insert_staff_admin
ON public.stock_usage
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
);

CREATE POLICY stock_usage_update_admin
ON public.stock_usage
FOR UPDATE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY stock_usage_delete_admin
ON public.stock_usage
FOR DELETE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

-- ------------------------------------------------------------
-- 16. ITEM INGREDIENTS
-- ------------------------------------------------------------

CREATE POLICY item_ingredients_select_own
ON public.item_ingredients
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.menu_items mi
    WHERE mi.id = item_ingredients.menu_item_id
      AND mi.restaurant_id = public.current_restaurant_id()
  )
);

CREATE POLICY item_ingredients_insert_admin
ON public.item_ingredients
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  AND EXISTS (
    SELECT 1
    FROM public.menu_items mi
    JOIN public.inventory i
      ON i.id = item_ingredients.inventory_id
    WHERE mi.id = item_ingredients.menu_item_id
      AND mi.restaurant_id = public.current_restaurant_id()
      AND i.restaurant_id = public.current_restaurant_id()
  )
);

CREATE POLICY item_ingredients_update_admin
ON public.item_ingredients
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  AND EXISTS (
    SELECT 1
    FROM public.menu_items mi
    WHERE mi.id = item_ingredients.menu_item_id
      AND mi.restaurant_id = public.current_restaurant_id()
  )
)
WITH CHECK (
  public.is_admin()
  AND EXISTS (
    SELECT 1
    FROM public.menu_items mi
    JOIN public.inventory i
      ON i.id = item_ingredients.inventory_id
    WHERE mi.id = item_ingredients.menu_item_id
      AND mi.restaurant_id = public.current_restaurant_id()
      AND i.restaurant_id = public.current_restaurant_id()
  )
);

CREATE POLICY item_ingredients_delete_admin
ON public.item_ingredients
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  AND EXISTS (
    SELECT 1
    FROM public.menu_items mi
    WHERE mi.id = item_ingredients.menu_item_id
      AND mi.restaurant_id = public.current_restaurant_id()
  )
);

-- ------------------------------------------------------------
-- 17. RESERVATIONS
-- ------------------------------------------------------------

CREATE POLICY reservations_select_own
ON public.reservations
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY reservations_insert_staff_admin
ON public.reservations
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
);

CREATE POLICY reservations_update_staff_admin
ON public.reservations
FOR UPDATE
TO authenticated
USING (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
)
WITH CHECK (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
);

CREATE POLICY reservations_delete_admin
ON public.reservations
FOR DELETE
TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

-- ------------------------------------------------------------
-- 18. PLUGINS / PLUGIN SETTINGS / PLUGIN LOGS
-- ------------------------------------------------------------

CREATE POLICY restaurant_plugins_select_own
ON public.restaurant_plugins
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY restaurant_plugins_manage_admin
ON public.restaurant_plugins
FOR ALL
TO authenticated
USING (
  public.can_manage_restaurant(restaurant_id)
)
WITH CHECK (
  public.can_manage_restaurant(restaurant_id)
);

CREATE POLICY plugin_settings_select_own
ON public.plugin_settings
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

CREATE POLICY plugin_settings_manage_admin
ON public.plugin_settings
FOR ALL
TO authenticated
USING (
  public.can_manage_restaurant(restaurant_id)
)
WITH CHECK (
  public.can_manage_restaurant(restaurant_id)
);

CREATE POLICY plugins_select_own
ON public.plugins
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()::text
);

CREATE POLICY plugins_manage_admin
ON public.plugins
FOR ALL
TO authenticated
USING (
  public.can_manage_restaurant(
    CASE
      WHEN restaurant_id ~* '^[0-9a-f-]{36}$'
      THEN restaurant_id::uuid
      ELSE NULL
    END
  )
)
WITH CHECK (
  public.can_manage_restaurant(
    CASE
      WHEN restaurant_id ~* '^[0-9a-f-]{36}$'
      THEN restaurant_id::uuid
      ELSE NULL
    END
  )
);

CREATE POLICY plugin_logs_select_own
ON public.plugin_logs
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR restaurant_id = public.current_restaurant_id()
);

-- Plugin logs should normally be written by trusted server-side code.
-- ------------------------------------------------------------
-- 19. SETTINGS
-- ------------------------------------------------------------

CREATE POLICY settings_select_self
ON public.settings
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin()
);

CREATE POLICY settings_insert_self
ON public.settings
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin()
);

CREATE POLICY settings_update_self
ON public.settings
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin()
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin()
);

CREATE POLICY settings_delete_self
ON public.settings
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin()
);

-- ------------------------------------------------------------
-- 20. LEGACY users TABLE
-- ------------------------------------------------------------

CREATE POLICY users_select_self_or_superadmin
ON public.users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_super_admin()
);

CREATE POLICY users_manage_superadmin
ON public.users
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- ------------------------------------------------------------
-- 21. SECURITY-HARDENED INVENTORY FUNCTION
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decrease_inventory(item_id uuid, qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
BEGIN
  IF qty IS NULL OR qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT restaurant_id
    INTO v_restaurant_id
  FROM public.inventory
  WHERE id = item_id
  FOR UPDATE;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  IF NOT public.is_restaurant_member(v_restaurant_id) THEN
    RAISE EXCEPTION 'Not authorized for this restaurant';
  END IF;

  UPDATE public.inventory
  SET quantity = quantity - qty
  WHERE id = item_id
    AND quantity >= qty;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient inventory';
  END IF;
END;
$$;

DO $$ BEGIN IF to_regprocedure('public.decrease_inventory(uuid, integer)') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.decrease_inventory(uuid, integer) FROM anon'; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.decrease_inventory(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrease_inventory(uuid, integer) TO service_role;

-- ------------------------------------------------------------
-- 22. WhatsApp config RPC intentionally deferred
-- ------------------------------------------------------------
-- The current plugin_settings table has no UNIQUE constraint on
-- (restaurant_id, plugin_code). We therefore do not change the existing
-- set_whatsapp_config() function in Stage 1. It will be fixed together
-- with the plugin architecture in Stage 2 after the application/API
-- contract is aligned with the live schema.

-- ------------------------------------------------------------
-- 23. Helpful indexes for RLS / tenant isolation
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_restaurant_id
  ON public.profiles (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id
  ON public.menu_items (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_offers_restaurant_id
  ON public.offers (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_restaurant_id
  ON public.inventory (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id
  ON public.orders (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_orders_source
  ON public.orders (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_item_id
  ON public.order_items (item_id);

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id
  ON public.reservations (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_banners_restaurant_id
  ON public.restaurant_banners (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_plugins_restaurant_id
  ON public.restaurant_plugins (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_plugin_settings_restaurant_id
  ON public.plugin_settings (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_plugin_logs_restaurant_id
  ON public.plugin_logs (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_stock_usage_restaurant_id
  ON public.stock_usage (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id
  ON public.tables (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_rooms_restaurant_id
  ON public.rooms (restaurant_id);

COMMIT;

-- ============================================================
-- END STAGE 1
-- ============================================================
