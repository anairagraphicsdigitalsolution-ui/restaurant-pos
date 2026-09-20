-- Align the production admin order-creation RLS fix with local migration history.
DROP POLICY IF EXISTS orders_insert_staff_permission ON public.orders;
CREATE POLICY orders_insert_staff_permission
  ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    is_staff_or_admin()
    AND is_restaurant_member(restaurant_id)
    AND (
      current_user_role() = 'admin'
      OR has_staff_permission(auth.uid(), 'orders')
    )
  );

DROP POLICY IF EXISTS order_items_insert_staff_permission ON public.order_items;
CREATE POLICY order_items_insert_staff_permission
  ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    is_staff_or_admin()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id = current_restaurant_id()
        AND (
          current_user_role() = 'admin'
          OR has_staff_permission(auth.uid(), 'orders')
        )
    )
  );

DROP POLICY IF EXISTS order_items_update_staff_permission ON public.order_items;
CREATE POLICY order_items_update_staff_permission
  ON public.order_items
  FOR UPDATE TO authenticated
  USING (
    is_staff_or_admin()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id = current_restaurant_id()
        AND (
          current_user_role() = 'admin'
          OR has_staff_permission(auth.uid(), 'orders')
        )
    )
  )
  WITH CHECK (
    is_staff_or_admin()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id = current_restaurant_id()
        AND (
          current_user_role() = 'admin'
          OR has_staff_permission(auth.uid(), 'orders')
        )
    )
  );
