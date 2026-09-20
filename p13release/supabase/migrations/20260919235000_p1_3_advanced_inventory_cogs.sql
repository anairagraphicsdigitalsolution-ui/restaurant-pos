-- P1.3 Advanced Inventory / COGS
-- Applied to connected Supabase project vgzwzvmuylsoqjkqfcnw
-- Cost layers + COGS ledger + recipe cost snapshots + FIFO consumption RPC.

CREATE TABLE IF NOT EXISTS public.inventory_cost_layers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE, batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
 method text NOT NULL DEFAULT 'fifo' CHECK(method IN ('fifo','weighted_average')), quantity_remaining numeric(14,4) NOT NULL DEFAULT 0 CHECK(quantity_remaining>=0),
 unit_cost numeric(14,4) NOT NULL DEFAULT 0 CHECK(unit_cost>=0), received_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.inventory_cogs_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL, inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
 quantity numeric(14,4) NOT NULL CHECK(quantity>0), unit_cost numeric(14,4) NOT NULL CHECK(unit_cost>=0), cogs_amount numeric(14,2) NOT NULL CHECK(cogs_amount>=0),
 costing_method text NOT NULL CHECK(costing_method IN ('fifo','weighted_average')), reference text, idempotency_key text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restaurant_id,idempotency_key));

CREATE TABLE IF NOT EXISTS public.recipe_cost_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE CASCADE, snapshot_date date NOT NULL DEFAULT current_date,
 recipe_cost numeric(14,2) NOT NULL DEFAULT 0, theoretical_food_cost_pct numeric(8,3), actual_cogs numeric(14,2) DEFAULT 0, variance numeric(14,2) DEFAULT 0,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());

CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_fifo ON public.inventory_cost_layers(restaurant_id,inventory_id,received_at,id);
CREATE INDEX IF NOT EXISTS idx_inventory_cogs_order ON public.inventory_cogs_transactions(restaurant_id,order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshot_menu_date ON public.recipe_cost_snapshots(restaurant_id,menu_item_id,snapshot_date DESC);

ALTER TABLE public.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cogs_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_cost_snapshots ENABLE ROW LEVEL SECURITY;
