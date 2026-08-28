-- Anaira local-first sync schema.
-- Safe to run after 001_phase1.sql and 002_phase2_core.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.restaurant_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid,
  image_url text,
  sort_order integer DEFAULT 4,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_restaurant_banners_restaurant
  ON public.restaurant_banners(restaurant_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.anaira_sync_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_node text NOT NULL,
  schema_name text NOT NULL,
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  primary_key jsonb NOT NULL,
  row_data jsonb,
  restaurant_id uuid,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.anaira_sync_events
  ADD COLUMN IF NOT EXISTS restaurant_id uuid;

CREATE INDEX IF NOT EXISTS anaira_sync_events_created_idx
  ON public.anaira_sync_events(created_at,id);

CREATE INDEX IF NOT EXISTS anaira_sync_events_restaurant_idx
  ON public.anaira_sync_events(restaurant_id,id);

CREATE TABLE IF NOT EXISTS public.anaira_sync_state (
  node_name text PRIMARY KEY,
  last_pushed_id bigint NOT NULL DEFAULT 0,
  last_pulled_id bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION public.anaira_sync_pk_json(
  _schema text,
  _table text,
  _row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  r record;
  out jsonb := '{}'::jsonb;
BEGIN
  FOR r IN
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid =
      format('%I.%I', _schema, _table)::regclass
      AND i.indisprimary
    ORDER BY array_position(i.indkey, a.attnum)
  LOOP
    out := out || jsonb_build_object(r.attname, _row->r.attname);
  END LOOP;
  RETURN out;
END
$$;

CREATE OR REPLACE FUNCTION public.anaira_sync_capture()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rowj jsonb;
  pkj jsonb;
  restaurant_id_value uuid;
BEGIN
  IF current_setting('app.sync_apply', true) = 'true' THEN
    RETURN coalesce(new, old);
  END IF;

  rowj := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(old)
    ELSE to_jsonb(new)
  END;

  pkj := public.anaira_sync_pk_json(
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    rowj
  );

  IF pkj = '{}'::jsonb THEN
    RETURN coalesce(new, old);
  END IF;

  IF TG_TABLE_NAME='restaurants' THEN
    restaurant_id_value := nullif(rowj->>'id','')::uuid;
  elsif rowj ? 'restaurant_id' THEN
    restaurant_id_value := nullif(rowj->>'restaurant_id','')::uuid;
  elsif rowj ? 'order_id' THEN
    SELECT o.restaurant_id INTO restaurant_id_value
    FROM public.orders o
    WHERE o.id = nullif(rowj->>'order_id','')::uuid
    LIMIT 1;
  elsif rowj ? 'menu_item_id' THEN
    SELECT m.restaurant_id INTO restaurant_id_value
    FROM public.menu_items m
    WHERE m.id = nullif(rowj->>'menu_item_id','')::uuid
    LIMIT 1;
  elsif rowj ? 'item_id' THEN
    SELECT m.restaurant_id INTO restaurant_id_value
    FROM public.menu_items m
    WHERE m.id = nullif(rowj->>'item_id','')::uuid
    LIMIT 1;
  elsif rowj ? 'inventory_id' THEN
    SELECT i.restaurant_id INTO restaurant_id_value
    FROM public.inventory i
    WHERE i.id = nullif(rowj->>'inventory_id','')::uuid
    LIMIT 1;
  elsif rowj ? 'table_id' THEN
    SELECT t.restaurant_id INTO restaurant_id_value
    FROM public.tables t
    WHERE t.id = nullif(rowj->>'table_id','')::uuid
    LIMIT 1;
  elsif rowj ? 'room_id' THEN
    SELECT r.restaurant_id INTO restaurant_id_value
    FROM public.rooms r
    WHERE r.id = nullif(rowj->>'room_id','')::uuid
    LIMIT 1;
  elsif rowj ? 'customer_id' THEN
    SELECT c.restaurant_id INTO restaurant_id_value
    FROM public.customers c
    WHERE c.id = nullif(rowj->>'customer_id','')::uuid
    LIMIT 1;
  ELSE
    restaurant_id_value := NULL;
  END IF;

  INSERT INTO public.anaira_sync_events (
    source_node,
    schema_name,
    table_name,
    operation,
    primary_key,
    row_data,
    restaurant_id,
    changed_at
  )
  VALUES (
    coalesce(
      nullif(current_setting('app.sync_node', true), ''),
      'restaurant-local-server'
    ),
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    TG_OP,
    pkj,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE rowj END,
    restaurant_id_value,
    clock_timestamp()
  );

  RETURN coalesce(new, old);
END
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND c.relname NOT IN ('anaira_sync_events','anaira_sync_state')
      AND EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = c.oid
          AND i.indisprimary
      )
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS anaira_sync_capture ON %I.%I',
      r.schema_name,
      r.table_name
    );

    EXECUTE format(
      'CREATE TRIGGER anaira_sync_capture
       AFTER INSERT OR UPDATE OR DELETE
       ON %I.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.anaira_sync_capture()',
      r.schema_name,
      r.table_name
    );
  END LOOP;
END
$$;
