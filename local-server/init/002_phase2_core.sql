CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY, name text, logo text, owner_id uuid, gst_enabled boolean DEFAULT true,
  gst_rate numeric DEFAULT 5, slug text, cover_image text, opening_time text, cuisine text,
  description text, address text, gst text, owner_name text, phone text, status text DEFAULT 'active',
  theme_config jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (id uuid PRIMARY KEY, restaurant_id uuid, role text, email text);
CREATE TABLE IF NOT EXISTS tables (id uuid PRIMARY KEY, table_number smallint, restaurant_id uuid, seats integer DEFAULT 4);
CREATE TABLE IF NOT EXISTS rooms (id uuid PRIMARY KEY, room_number smallint, restaurant_id uuid);
CREATE TABLE IF NOT EXISTS menu_items (id uuid PRIMARY KEY, name text, price integer, category text, restaurant_id uuid, image text, description text);
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY, source_type text DEFAULT 'table', source_id text, status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(), restaurant_id uuid, source_label text, overall_note text,
  subtotal numeric(12,2) DEFAULT 0, discount_amount numeric(12,2) DEFAULT 0, tax_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0, offer_id uuid, invoice_no text, payment_status text DEFAULT 'unpaid',
  payment_method text, paid_amount numeric(12,2) DEFAULT 0, billed_at timestamptz,
  inventory_consumed boolean DEFAULT false, cancelled_at timestamptz, cancellation_reason text,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY, order_id uuid, item_id uuid, quantity integer, cooking_request text,
  item_name text, unit_price numeric(12,2), line_total numeric(12,2), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL, name text NOT NULL, phone text, email text, notes text,
  loyalty_points integer DEFAULT 0, total_orders integer DEFAULT 0, total_spend numeric(14,2) DEFAULT 0,
  last_visit_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY, name text, quantity integer, unit text, restaurant_id uuid, category text, supplier text,
  min_stock integer DEFAULT 5, sku text, cost_price numeric DEFAULT 0, expiry_date date, notes text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL, inventory_id uuid NOT NULL, transaction_type text NOT NULL,
  quantity_delta integer NOT NULL, quantity_after integer NOT NULL, reference_id uuid, reason text, actor_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS restaurant_plugins (
  id uuid PRIMARY KEY, restaurant_id uuid, plugin_slug text, enabled boolean DEFAULT true, config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(), plugin_code text
);
CREATE TABLE IF NOT EXISTS plugin_settings (id uuid PRIMARY KEY, restaurant_id uuid, plugin_code text, config jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY, name text, phone text, table_id uuid, date date, time text, status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(), guests integer DEFAULT 1, duration integer DEFAULT 60, reservation_end timestamptz,
  notes text, restaurant_id uuid, reservation_start_at timestamptz, reservation_end_at timestamptz, waitlist boolean DEFAULT false,
  deposit_amount numeric DEFAULT 0, occasion text, vip boolean DEFAULT false, no_show boolean DEFAULT false, reminder_sent boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS print_jobs (
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL, printer_id uuid, job_type text NOT NULL, reference_id uuid,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL, status text DEFAULT 'queued', attempts integer DEFAULT 0,
  last_error text, printed_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoice_sequences (restaurant_id uuid PRIMARY KEY, next_number bigint DEFAULT 1 NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS settings (id uuid PRIMARY KEY, user_id uuid, gst_enabled boolean DEFAULT true, gst_rate numeric DEFAULT 5, created_at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS local_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity text NOT NULL, entity_id uuid NOT NULL, operation text NOT NULL,
  restaurant_id uuid, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','syncing','synced','error')),
  attempts integer NOT NULL DEFAULT 0, last_error text, UNIQUE(entity, entity_id, operation, created_at)
);
CREATE INDEX IF NOT EXISTS idx_local_outbox_pending ON local_sync_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_local_orders_restaurant ON orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_order_items_order ON order_items(order_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_mode text DEFAULT 'dine_in';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_amount numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_status text DEFAULT 'active';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reopened_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_due_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packaging_charge numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_note text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_charge numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS floor text DEFAULT 'Ground Floor';
ALTER TABLE tables ADD COLUMN IF NOT EXISTS section text DEFAULT 'Main';
ALTER TABLE tables ADD COLUMN IF NOT EXISTS shape text DEFAULT 'rectangle';
ALTER TABLE tables ADD COLUMN IF NOT EXISTS position_x numeric DEFAULT 0;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS position_y numeric DEFAULT 0;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS status text DEFAULT 'available';
ALTER TABLE tables ADD COLUMN IF NOT EXISTS waiter_id uuid;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_enabled boolean DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'single';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS combo_config jsonb;
