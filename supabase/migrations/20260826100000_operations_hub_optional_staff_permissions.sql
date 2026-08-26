-- Operations Hub is an optional Super-Admin-controlled plugin.
-- Turning it OFF hides/disables only the Operations Hub workspace.
-- Restaurant Core POS remains available and its data is untouched.
--
-- Staff permissions are real access controls:
--   Admin/Super Admin: full restaurant access.
--   Staff: access only to permission keys explicitly enabled.
--   Permission management itself: Admin/Super Admin only.
--
-- Modifiers:
--   Staff may SELECT modifier definitions so ordering continues to work.
--   Only Admin/Super Admin may change modifier configuration.

CREATE OR REPLACE FUNCTION public.is_restaurant_feature_enabled(
  p_restaurant_id uuid,
  p_plugin_code text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested AS (
    SELECT lower(trim(coalesce(p_plugin_code,''))) AS code
  )
  SELECT CASE
    WHEN requested.code = 'operations-hub' THEN EXISTS (
      SELECT 1
      FROM public.restaurant_plugins rp
      WHERE rp.restaurant_id = p_restaurant_id
        AND rp.plugin_code = 'operations-hub'
        AND rp.enabled = true
    )

    WHEN requested.code IN (
      'restaurant-core','pos-core','payments','takeaway','delivery',
      'delivery-settlement','token-management','split-merge-bills',
      'table-management','table-transfer','refunds-voids','discounts-tax',
      'e-bill','cash-closing','kds','kds-stations'
    ) THEN true

    WHEN requested.code = 'restaurant-pro' THEN EXISTS (
      SELECT 1
      FROM public.restaurant_plugins rp
      WHERE rp.restaurant_id = p_restaurant_id
        AND rp.plugin_code = 'restaurant-pro'
        AND rp.enabled = true
    )

    WHEN requested.code = 'loyalty' THEN EXISTS (
      SELECT 1
      FROM public.restaurant_plugins rp
      WHERE rp.restaurant_id = p_restaurant_id
        AND rp.plugin_code = 'loyalty'
        AND rp.enabled = true
    )

    ELSE (
      EXISTS (
        SELECT 1
        FROM public.restaurant_plugins rp
        WHERE rp.restaurant_id = p_restaurant_id
          AND rp.plugin_code = requested.code
          AND rp.enabled = true
      )
      AND EXISTS (
        SELECT 1
        FROM public.restaurant_plugins master
        WHERE master.restaurant_id = p_restaurant_id
          AND master.plugin_code = 'restaurant-pro'
          AND master.enabled = true
      )
    )
  END
  FROM requested;
$$;

GRANT EXECUTE ON FUNCTION public.is_restaurant_feature_enabled(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant_feature_enabled(uuid,text) TO service_role;

-- Permission records cannot be changed by ordinary staff.
DROP POLICY IF EXISTS permissions_scoped ON public.staff_permissions;

CREATE POLICY permissions_select_admin
ON public.staff_permissions
FOR SELECT TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

CREATE POLICY permissions_insert_admin
ON public.staff_permissions
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY permissions_update_admin
ON public.staff_permissions
FOR UPDATE TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY permissions_delete_admin
ON public.staff_permissions
FOR DELETE TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

-- Modifier configuration: read for restaurant members, write for admins.
DROP POLICY IF EXISTS modifier_groups_scoped ON public.modifier_groups;

CREATE POLICY modifier_groups_select_member
ON public.modifier_groups
FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY modifier_groups_insert_admin
ON public.modifier_groups
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY modifier_groups_update_admin
ON public.modifier_groups
FOR UPDATE TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY modifier_groups_delete_admin
ON public.modifier_groups
FOR DELETE TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

DROP POLICY IF EXISTS modifiers_scoped ON public.modifiers;

CREATE POLICY modifiers_select_member
ON public.modifiers
FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY modifiers_insert_admin
ON public.modifiers
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY modifiers_update_admin
ON public.modifiers
FOR UPDATE TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY modifiers_delete_admin
ON public.modifiers
FOR DELETE TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

DROP POLICY IF EXISTS menu_item_modifier_groups_scoped ON public.menu_item_modifier_groups;

CREATE POLICY menu_item_modifier_groups_select_member
ON public.menu_item_modifier_groups
FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY menu_item_modifier_groups_insert_admin
ON public.menu_item_modifier_groups
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY menu_item_modifier_groups_update_admin
ON public.menu_item_modifier_groups
FOR UPDATE TO authenticated
USING (public.can_manage_restaurant(restaurant_id))
WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY menu_item_modifier_groups_delete_admin
ON public.menu_item_modifier_groups
FOR DELETE TO authenticated
USING (public.can_manage_restaurant(restaurant_id));

-- Orders.
DROP POLICY IF EXISTS orders_select_staff_admin ON public.orders;
DROP POLICY IF EXISTS orders_insert_staff_admin ON public.orders;
DROP POLICY IF EXISTS orders_update_staff_admin ON public.orders;

CREATE POLICY orders_select_staff_permission
ON public.orders FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    restaurant_id = public.current_restaurant_id()
    AND public.has_staff_permission(auth.uid(),'orders')
  )
);

CREATE POLICY orders_insert_staff_permission
ON public.orders FOR INSERT TO authenticated
WITH CHECK (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'orders')
);

CREATE POLICY orders_update_staff_permission
ON public.orders FOR UPDATE TO authenticated
USING (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'orders')
)
WITH CHECK (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'orders')
);

-- Order items follow the parent order permission.
DROP POLICY IF EXISTS order_items_select_staff_admin ON public.order_items;
DROP POLICY IF EXISTS order_items_insert_staff_admin ON public.order_items;
DROP POLICY IF EXISTS order_items_update_staff_admin ON public.order_items;

CREATE POLICY order_items_select_staff_permission
ON public.order_items FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.restaurant_id = public.current_restaurant_id()
      AND public.has_staff_permission(auth.uid(),'orders')
  )
);

CREATE POLICY order_items_insert_staff_permission
ON public.order_items FOR INSERT TO authenticated
WITH CHECK (
  public.is_staff_or_admin()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.restaurant_id = public.current_restaurant_id()
      AND public.has_staff_permission(auth.uid(),'orders')
  )
);

CREATE POLICY order_items_update_staff_permission
ON public.order_items FOR UPDATE TO authenticated
USING (
  public.is_staff_or_admin()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.restaurant_id = public.current_restaurant_id()
      AND public.has_staff_permission(auth.uid(),'orders')
  )
)
WITH CHECK (
  public.is_staff_or_admin()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.restaurant_id = public.current_restaurant_id()
      AND public.has_staff_permission(auth.uid(),'orders')
  )
);

-- Modifier rows attached to orders follow the order permission.
DROP POLICY IF EXISTS order_item_modifiers_scoped ON public.order_item_modifiers;

CREATE POLICY order_item_modifiers_staff_permission
ON public.order_item_modifiers
USING (
  EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_modifiers.order_item_id
      AND public.has_staff_permission(auth.uid(),'orders')
      AND public.is_restaurant_member(o.restaurant_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_modifiers.order_item_id
      AND public.has_staff_permission(auth.uid(),'orders')
      AND public.is_restaurant_member(o.restaurant_id)
  )
);

-- Billing/payment permission.
DROP POLICY IF EXISTS order_payments_select_staff_admin ON public.order_payments;
DROP POLICY IF EXISTS order_payments_insert_staff_admin ON public.order_payments;
DROP POLICY IF EXISTS order_payments_update_staff_admin ON public.order_payments;
DROP POLICY IF EXISTS "restaurant members order_payments" ON public.order_payments;

CREATE POLICY order_payments_select_staff_permission
ON public.order_payments FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    public.is_staff_or_admin()
    AND public.is_restaurant_member(restaurant_id)
    AND public.has_staff_permission(auth.uid(),'billing')
  )
);

CREATE POLICY order_payments_insert_staff_permission
ON public.order_payments FOR INSERT TO authenticated
WITH CHECK (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'billing')
);

CREATE POLICY order_payments_update_staff_permission
ON public.order_payments FOR UPDATE TO authenticated
USING (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'billing')
)
WITH CHECK (
  public.is_staff_or_admin()
  AND public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'billing')
);

-- KOT/Kitchen.
DROP POLICY IF EXISTS kot_scoped ON public.kot_tickets;

CREATE POLICY kot_staff_permission
ON public.kot_tickets
USING (
  public.is_super_admin()
  OR (
    public.is_restaurant_member(restaurant_id)
    AND public.has_staff_permission(auth.uid(),'kitchen')
  )
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'kitchen')
);

-- The live kitchen ticket table also gets the same restriction.
DROP POLICY IF EXISTS "restaurant members kitchen_order_tickets" ON public.kitchen_order_tickets;

CREATE POLICY kitchen_order_tickets_staff_permission
ON public.kitchen_order_tickets
USING (
  public.is_super_admin()
  OR (
    public.is_restaurant_member(restaurant_id)
    AND public.has_staff_permission(auth.uid(),'kitchen')
  )
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'kitchen')
);

-- Attendance, expenses, customers and feedback.
DROP POLICY IF EXISTS attendance_scoped ON public.staff_attendance;
CREATE POLICY attendance_staff_permission
ON public.staff_attendance
USING (
  public.is_super_admin()
  OR (
    public.is_restaurant_member(restaurant_id)
    AND public.has_staff_permission(auth.uid(),'attendance')
  )
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'attendance')
);

DROP POLICY IF EXISTS expenses_scoped ON public.expenses;
CREATE POLICY expenses_staff_permission
ON public.expenses
USING (
  public.is_super_admin()
  OR (
    public.is_restaurant_member(restaurant_id)
    AND public.has_staff_permission(auth.uid(),'expenses')
  )
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'expenses')
);

DROP POLICY IF EXISTS customers_scoped ON public.customers;
CREATE POLICY customers_staff_permission
ON public.customers
USING (
  public.is_super_admin()
  OR (
    public.is_restaurant_member(restaurant_id)
    AND public.has_staff_permission(auth.uid(),'customers')
  )
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'customers')
);

DROP POLICY IF EXISTS feedback_scoped ON public.customer_feedback;
CREATE POLICY feedback_staff_permission
ON public.customer_feedback
USING (
  public.is_super_admin()
  OR (
    public.is_restaurant_member(restaurant_id)
    AND public.has_staff_permission(auth.uid(),'customers')
  )
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id)
  AND public.has_staff_permission(auth.uid(),'customers')
);
