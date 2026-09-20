-- Anaira Phase 3: Inventory + Recipe/BOM + Purchasing foundation
-- Additive and tenant-scoped. No existing business rows are deleted or rewritten.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS reorder_level integer;

UPDATE public.inventory
SET reorder_level = COALESCE(reorder_level, min_stock, 0)
WHERE reorder_level IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_restaurant_category
  ON public.inventory (restaurant_id, category);
CREATE INDEX IF NOT EXISTS idx_inventory_restaurant_reorder
  ON public.inventory (restaurant_id, quantity, reorder_level);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit text,
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  received_quantity numeric NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity > 0),
  unit text,
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  batch_no text,
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_items_purchase
  ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_receipt
  ON public.goods_receipt_items (goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_inventory
  ON public.goods_receipt_items (inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry
  ON public.inventory_batches (restaurant_id, expiry_date, status);
CREATE INDEX IF NOT EXISTS idx_inventory_wastage_restaurant_created
  ON public.inventory_wastage (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_restaurant_created
  ON public.inventory_movements (restaurant_id, created_at DESC);

-- RLS for Phase 3 inventory support tables.
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_wastage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phase3_inventory_movements_restaurant ON public.inventory_movements;
CREATE POLICY phase3_inventory_movements_restaurant ON public.inventory_movements
  FOR ALL TO authenticated
  USING (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS phase3_inventory_batches_restaurant ON public.inventory_batches;
CREATE POLICY phase3_inventory_batches_restaurant ON public.inventory_batches
  FOR ALL TO authenticated
  USING (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS phase3_inventory_transfers_restaurant ON public.inventory_transfers;
CREATE POLICY phase3_inventory_transfers_restaurant ON public.inventory_transfers
  FOR ALL TO authenticated
  USING (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS phase3_inventory_wastage_restaurant ON public.inventory_wastage;
CREATE POLICY phase3_inventory_wastage_restaurant ON public.inventory_wastage
  FOR ALL TO authenticated
  USING (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS phase3_purchase_orders_restaurant ON public.purchase_orders;
CREATE POLICY phase3_purchase_orders_restaurant ON public.purchase_orders
  FOR ALL TO authenticated
  USING (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS phase3_purchase_order_items_restaurant ON public.purchase_order_items;
CREATE POLICY phase3_purchase_order_items_restaurant ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'))
  WITH CHECK (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'));

DROP POLICY IF EXISTS phase3_goods_receipts_restaurant ON public.goods_receipts;
CREATE POLICY phase3_goods_receipts_restaurant ON public.goods_receipts
  FOR ALL TO authenticated
  USING (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS phase3_goods_receipt_items_restaurant ON public.goods_receipt_items;
CREATE POLICY phase3_goods_receipt_items_restaurant ON public.goods_receipt_items
  FOR ALL TO authenticated
  USING (goods_receipt_id IN (SELECT id FROM public.goods_receipts WHERE restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'))
  WITH CHECK (goods_receipt_id IN (SELECT id FROM public.goods_receipts WHERE restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'));

DROP POLICY IF EXISTS phase3_supplier_payments_restaurant ON public.supplier_payments;
CREATE POLICY phase3_supplier_payments_restaurant ON public.supplier_payments
  FOR ALL TO authenticated
  USING (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK (restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');

-- Record wastage atomically against current stock.
CREATE OR REPLACE FUNCTION public.phase3_record_wastage(
  p_inventory_id uuid,
  p_quantity integer,
  p_reason text DEFAULT 'Wastage'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile record; v_item record; v_new numeric;
BEGIN
  SELECT id, restaurant_id, role INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile.id IS NULL OR v_profile.role NOT IN ('admin','staff','super_admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  SELECT * INTO v_item FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  IF v_profile.role <> 'super_admin' AND v_item.restaurant_id <> v_profile.restaurant_id THEN RAISE EXCEPTION 'Inventory item belongs to another restaurant'; END IF;
  IF COALESCE(v_item.quantity,0) < p_quantity THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
  v_new := COALESCE(v_item.quantity,0) - p_quantity;
  UPDATE public.inventory SET quantity = v_new WHERE id = v_item.id;
  INSERT INTO public.inventory_wastage(restaurant_id,inventory_id,quantity,unit,reason,cost,created_by)
    VALUES(v_item.restaurant_id,v_item.id,p_quantity,v_item.unit,left(coalesce(p_reason,'Wastage'),500),p_quantity*COALESCE(v_item.cost_price,0),v_profile.id);
  INSERT INTO public.inventory_movements(restaurant_id,inventory_id,movement_type,quantity,unit,reference_type,reference_id,unit_cost,reason,created_by)
    VALUES(v_item.restaurant_id,v_item.id,'wastage',-p_quantity,v_item.unit,'wastage',NULL,COALESCE(v_item.cost_price,0),left(coalesce(p_reason,'Wastage'),500),v_profile.id);
  INSERT INTO public.inventory_transactions(restaurant_id,inventory_id,transaction_type,quantity_delta,quantity_after,reason,actor_id)
    VALUES(v_item.restaurant_id,v_item.id,'wastage',-p_quantity::integer,v_new::integer,left(coalesce(p_reason,'Wastage'),500),v_profile.id);
  RETURN jsonb_build_object('inventory_id',v_item.id,'quantity',v_new,'cost',p_quantity*COALESCE(v_item.cost_price,0));
END; $$;
REVOKE ALL ON FUNCTION public.phase3_record_wastage(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase3_record_wastage(uuid,numeric,text) TO authenticated;

-- Food cost for a menu item using recipe/BOM rows and current inventory cost_price.
CREATE OR REPLACE FUNCTION public.phase3_menu_food_cost(p_menu_item_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'menu_item_id', p_menu_item_id,
    'ingredient_cost', COALESCE(SUM(COALESCE(rri.quantity,0) * COALESCE(i.cost_price,0)),0),
    'ingredients', COALESCE(jsonb_agg(jsonb_build_object(
      'inventory_id', i.id, 'name', i.name, 'quantity', rri.quantity,
      'unit', COALESCE(rri.unit,i.unit), 'unit_cost', COALESCE(i.cost_price,0),
      'line_cost', COALESCE(rri.quantity,0) * COALESCE(i.cost_price,0)
    ) ORDER BY i.name) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb)
  )
  FROM public.restaurant_recipe_items rri
  JOIN public.restaurant_recipes rr ON rr.id = rri.recipe_id
  LEFT JOIN public.inventory i ON i.id = rri.inventory_id
  WHERE rr.menu_item_id = p_menu_item_id
    AND rr.restaurant_id = (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.phase3_menu_food_cost(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase3_menu_food_cost(uuid) TO authenticated;

-- Receive a purchase order and update stock/batches/ledger in one transaction.
CREATE OR REPLACE FUNCTION public.phase3_receive_purchase(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile record; v_po record; v_row jsonb; v_item record; v_inv record; v_qty numeric; v_new numeric; v_grn uuid;
BEGIN
  SELECT id, restaurant_id, role INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile.id IS NULL OR v_profile.role NOT IN ('admin','staff','super_admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id=p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_profile.role <> 'super_admin' AND v_po.restaurant_id <> v_profile.restaurant_id THEN RAISE EXCEPTION 'Purchase order belongs to another restaurant'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Receipt items required'; END IF;
  INSERT INTO public.goods_receipts(restaurant_id,purchase_order_id,grn_number,received_by,notes)
    VALUES(v_po.restaurant_id,v_po.id,'GRN-'||to_char(now(),'YYYYMMDDHH24MISS'),v_profile.id,p_notes) RETURNING id INTO v_grn;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item := NULL;
    SELECT * INTO v_item FROM public.purchase_order_items WHERE id=(v_row->>'purchase_order_item_id')::uuid AND purchase_order_id=v_po.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order item not found'; END IF;
    v_qty := COALESCE((v_row->>'quantity')::numeric,0);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_qty > GREATEST(COALESCE(v_item.quantity,0)-COALESCE(v_item.received_quantity,0),0) THEN RAISE EXCEPTION 'Receiving quantity exceeds pending quantity for %',v_item.name; END IF;
    IF v_item.inventory_id IS NULL THEN RAISE EXCEPTION 'Map % to an inventory item before receiving',v_item.name; END IF;
    SELECT * INTO v_inv FROM public.inventory WHERE id=v_item.inventory_id FOR UPDATE;
    IF NOT FOUND OR v_inv.restaurant_id<>v_po.restaurant_id THEN RAISE EXCEPTION 'Invalid inventory mapping'; END IF;
    v_new := COALESCE(v_inv.quantity,0)+v_qty;
    UPDATE public.inventory SET quantity=v_new, cost_price=COALESCE(v_item.unit_cost,cost_price), reorder_level=COALESCE(reorder_level,min_stock) WHERE id=v_inv.id;
    UPDATE public.purchase_order_items SET received_quantity=COALESCE(received_quantity,0)+v_qty WHERE id=v_item.id;
    INSERT INTO public.goods_receipt_items(goods_receipt_id,purchase_order_item_id,inventory_id,quantity,unit,unit_cost,batch_no,expiry_date)
      VALUES(v_grn,v_item.id,v_inv.id,v_qty,v_item.unit,v_item.unit_cost,v_row->>'batch_no',NULLIF(v_row->>'expiry_date','')::date);
    INSERT INTO public.inventory_batches(restaurant_id,inventory_id,batch_no,quantity,unit,unit_cost,expiry_date,status)
      VALUES(v_po.restaurant_id,v_inv.id,v_row->>'batch_no',v_qty,v_item.unit,v_item.unit_cost,NULLIF(v_row->>'expiry_date','')::date,'active');
    INSERT INTO public.inventory_movements(restaurant_id,inventory_id,movement_type,quantity,unit,reference_type,reference_id,unit_cost,reason,created_by)
      VALUES(v_po.restaurant_id,v_inv.id,'purchase_receipt',v_qty,v_item.unit,'goods_receipt',v_grn,v_item.unit_cost,'Purchase receipt',v_profile.id);
    INSERT INTO public.inventory_transactions(restaurant_id,inventory_id,transaction_type,quantity_delta,quantity_after,reference_id,reason,actor_id)
      VALUES(v_po.restaurant_id,v_inv.id,'purchase_receipt',v_qty::integer,v_new::integer,v_grn,'Purchase receipt',v_profile.id);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id=v_po.id AND received_quantity < quantity) THEN
    UPDATE public.purchase_orders SET status='received' WHERE id=v_po.id;
  ELSE
    UPDATE public.purchase_orders SET status='partially_received' WHERE id=v_po.id;
  END IF;
  RETURN jsonb_build_object('success',true,'goods_receipt_id',v_grn,'purchase_order_id',v_po.id);
END; $$;
REVOKE ALL ON FUNCTION public.phase3_receive_purchase(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase3_receive_purchase(uuid,jsonb,text) TO authenticated;

-- Keep the legacy item_ingredients bridge in sync when a recipe is saved by clients.
CREATE OR REPLACE FUNCTION public.phase3_sync_recipe_item_ingredients(p_recipe_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_recipe record;
BEGIN
  SELECT * INTO v_recipe FROM public.restaurant_recipes WHERE id=p_recipe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipe not found'; END IF;
  DELETE FROM public.item_ingredients WHERE menu_item_id=v_recipe.menu_item_id;
  INSERT INTO public.item_ingredients(menu_item_id,inventory_id,quantity_used)
    SELECT v_recipe.menu_item_id,rri.inventory_id,ROUND(rri.quantity)::integer
    FROM public.restaurant_recipe_items rri WHERE rri.recipe_id=p_recipe_id AND rri.quantity>0;
END; $$;
REVOKE ALL ON FUNCTION public.phase3_sync_recipe_item_ingredients(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase3_sync_recipe_item_ingredients(uuid) TO authenticated;
