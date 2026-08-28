CREATE OR REPLACE FUNCTION public.anaira_sync_capture()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  rowj jsonb;
  pkj jsonb;
  op text;
  restaurant_id_value uuid;
BEGIN
  IF current_setting('app.sync_apply', true) = 'true' THEN
    RETURN coalesce(new, old);
  END IF;

  rowj :=
    CASE
      WHEN TG_OP = 'DELETE' THEN to_jsonb(old)
      ELSE to_jsonb(new)
    END;

  op := TG_OP;

  pkj :=
    public.anaira_sync_pk_json(
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      rowj
    );

  IF pkj = '{}'::jsonb THEN
    RETURN coalesce(new, old);
  END IF;

  IF TG_TABLE_NAME = 'restaurants' THEN
    restaurant_id_value := NULLIF(rowj ->> 'id', '')::uuid;

  ELSIF rowj ? 'restaurant_id' THEN
    restaurant_id_value := NULLIF(rowj ->> 'restaurant_id', '')::uuid;

  ELSIF rowj ? 'order_id' THEN
    SELECT o.restaurant_id INTO restaurant_id_value
    FROM public.orders o
    WHERE o.id = NULLIF(rowj ->> 'order_id', '')::uuid
    LIMIT 1;

  ELSIF rowj ? 'menu_item_id' THEN
    SELECT m.restaurant_id INTO restaurant_id_value
    FROM public.menu_items m
    WHERE m.id = NULLIF(rowj ->> 'menu_item_id', '')::uuid
    LIMIT 1;

  ELSIF rowj ? 'item_id' THEN
    SELECT m.restaurant_id INTO restaurant_id_value
    FROM public.menu_items m
    WHERE m.id = NULLIF(rowj ->> 'item_id', '')::uuid
    LIMIT 1;

  ELSIF rowj ? 'inventory_id' THEN
    SELECT i.restaurant_id INTO restaurant_id_value
    FROM public.inventory i
    WHERE i.id = NULLIF(rowj ->> 'inventory_id', '')::uuid
    LIMIT 1;

  ELSIF rowj ? 'table_id' THEN
    SELECT t.restaurant_id INTO restaurant_id_value
    FROM public.tables t
    WHERE t.id = NULLIF(rowj ->> 'table_id', '')::uuid
    LIMIT 1;

  ELSIF rowj ? 'room_id' THEN
    SELECT r.restaurant_id INTO restaurant_id_value
    FROM public.rooms r
    WHERE r.id = NULLIF(rowj ->> 'room_id', '')::uuid
    LIMIT 1;

  ELSIF rowj ? 'customer_id' THEN
    SELECT c.restaurant_id INTO restaurant_id_value
    FROM public.customers c
    WHERE c.id = NULLIF(rowj ->> 'customer_id', '')::uuid
    LIMIT 1;

  ELSE
    restaurant_id_value := NULL;
  END IF;

  INSERT INTO public.anaira_sync_events
  (
    source_node,
    schema_name,
    table_name,
    operation,
    primary_key,
    row_data,
    restaurant_id,
    changed_at
  )
  VALUES
  (
    coalesce(
      nullif(current_setting('app.sync_node', true), ''),
      'cloud-super-admin'
    ),
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    op,
    pkj,
    CASE
      WHEN op = 'DELETE' THEN NULL
      ELSE rowj
    END,
    restaurant_id_value,
    clock_timestamp()
  );

  RETURN coalesce(new, old);
END
$function$;
