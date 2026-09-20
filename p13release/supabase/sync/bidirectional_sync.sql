-- Bidirectional application-level sync metadata.
-- Applied to BOTH the cloud and self-hosted databases.
-- The sync worker uses direct Postgres transactions and sets app.sync_apply=true
-- while applying remote events, preventing trigger loops.

create table if not exists public.anaira_sync_events (
  id bigint generated always as identity primary key,
  source_node text not null,
  schema_name text not null,
  table_name text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  primary_key jsonb not null,
  row_data jsonb,
  restaurant_id uuid,
  changed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);
ALTER TABLE public.anaira_sync_events ADD COLUMN IF NOT EXISTS restaurant_id uuid;
create index if not exists anaira_sync_events_created_idx on public.anaira_sync_events(created_at, id);
create index if not exists anaira_sync_events_restaurant_idx on public.anaira_sync_events(restaurant_id, id);

create table if not exists public.anaira_sync_state (
  node_name text primary key,
  last_pushed_id bigint not null default 0,
  last_pulled_id bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);

create or replace function public.anaira_sync_pk_json(_schema text, _table text, _row jsonb)
returns jsonb language plpgsql stable as $$
declare r record; out jsonb := '{}'::jsonb;
begin
  for r in
    select a.attname
    from pg_index i
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
    where i.indrelid=format('%I.%I',_schema,_table)::regclass and i.indisprimary
    order by array_position(i.indkey,a.attnum)
  loop
    out := out || jsonb_build_object(r.attname, _row->r.attname);
  end loop;
  return out;
end $$;

create or replace function public.anaira_sync_capture()
returns trigger language plpgsql as $$
declare rowj jsonb; pkj jsonb; restaurant_id_value uuid;
begin
  if current_setting('app.sync_apply',true)='true' then return coalesce(new,old); end if;
  rowj := case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  pkj := public.anaira_sync_pk_json(TG_TABLE_SCHEMA,TG_TABLE_NAME,rowj);
  if pkj='{}'::jsonb then return coalesce(new,old); end if;
  if TG_TABLE_NAME='restaurants' then
    restaurant_id_value := nullif(rowj->>'id','')::uuid;
  elsif rowj ? 'restaurant_id' then
    restaurant_id_value := nullif(rowj->>'restaurant_id','')::uuid;
  elsif rowj ? 'order_id' then
    select o.restaurant_id into restaurant_id_value
    from public.orders o
    where o.id = nullif(rowj->>'order_id','')::uuid
    limit 1;
  elsif rowj ? 'menu_item_id' then
    select m.restaurant_id into restaurant_id_value
    from public.menu_items m
    where m.id = nullif(rowj->>'menu_item_id','')::uuid
    limit 1;
  elsif rowj ? 'item_id' then
    select m.restaurant_id into restaurant_id_value
    from public.menu_items m
    where m.id = nullif(rowj->>'item_id','')::uuid
    limit 1;
  elsif rowj ? 'inventory_id' then
    select i.restaurant_id into restaurant_id_value
    from public.inventory i
    where i.id = nullif(rowj->>'inventory_id','')::uuid
    limit 1;
  elsif rowj ? 'table_id' then
    select t.restaurant_id into restaurant_id_value
    from public.tables t
    where t.id = nullif(rowj->>'table_id','')::uuid
    limit 1;
  elsif rowj ? 'room_id' then
    select r.restaurant_id into restaurant_id_value
    from public.rooms r
    where r.id = nullif(rowj->>'room_id','')::uuid
    limit 1;
  elsif rowj ? 'customer_id' then
    select c.restaurant_id into restaurant_id_value
    from public.customers c
    where c.id = nullif(rowj->>'customer_id','')::uuid
    limit 1;
  else
    restaurant_id_value := NULL;
  end if;
  insert into public.anaira_sync_events(source_node,schema_name,table_name,operation,primary_key,row_data,restaurant_id,changed_at)
  values(coalesce(nullif(current_setting('app.sync_node',true),''),'restaurant-local-server'),TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_OP,pkj,case when TG_OP='DELETE' then null else rowj end,restaurant_id_value,clock_timestamp());
  return coalesce(new,old);
end $$;

DO $$
declare r record;
begin
  for r in
    select n.nspname schema_name,c.relname table_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and n.nspname='public'
      and c.relname not in ('anaira_sync_events','anaira_sync_state')
      and exists(select 1 from pg_index i where i.indrelid=c.oid and i.indisprimary)
  loop
    execute format('drop trigger if exists anaira_sync_capture on %I.%I',r.schema_name,r.table_name);
    execute format('create trigger anaira_sync_capture after insert or update or delete on %I.%I for each row execute function public.anaira_sync_capture()',r.schema_name,r.table_name);
  end loop;
end $$;

ALTER TABLE public.anaira_sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anaira_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.anaira_sync_events, public.anaira_sync_state FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anaira_sync_capture() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anaira_sync_pk_json(text,text,jsonb) FROM anon, authenticated;
