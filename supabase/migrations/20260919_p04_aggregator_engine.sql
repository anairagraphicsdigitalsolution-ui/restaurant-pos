create table if not exists public.aggregator_item_mappings (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 provider text not null check (provider in ('swiggy','zomato')),
 external_item_id text not null,
 external_item_name text,
 menu_item_id uuid references public.menu_items(id) on delete set null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (restaurant_id,provider,external_item_id)
);
create unique index if not exists uq_orders_restaurant_client_request on public.orders(restaurant_id,client_request_id) where client_request_id is not null;
create index if not exists idx_agg_item_map_restaurant_provider on public.aggregator_item_mappings(restaurant_id,provider,active);
alter table public.p0_aggregator_events add column if not exists processed_order_id uuid references public.orders(id) on delete set null;
alter table public.p0_aggregator_events add column if not exists idempotency_key text;
create index if not exists idx_p0_agg_events_order on public.p0_aggregator_events(restaurant_id,processed_order_id);
alter table public.aggregator_orders add column if not exists accepted_at timestamptz;
alter table public.aggregator_orders add column if not exists rejected_at timestamptz;
alter table public.aggregator_orders add column if not exists ready_at timestamptz;
alter table public.aggregator_orders add column if not exists picked_up_at timestamptz;
alter table public.aggregator_orders add column if not exists last_error text;

alter table public.aggregator_item_mappings enable row level security;
drop policy if exists agg_item_mapping_select on public.aggregator_item_mappings;
create policy agg_item_mapping_select on public.aggregator_item_mappings for select to authenticated using (public.is_super_admin() or public.is_restaurant_member(restaurant_id));

drop policy if exists agg_item_mapping_write on public.aggregator_item_mappings;
create policy agg_item_mapping_write on public.aggregator_item_mappings for all to authenticated using (public.is_super_admin() or public.is_restaurant_member(restaurant_id)) with check (public.is_super_admin() or public.is_restaurant_member(restaurant_id));

create or replace function public.p0_4_process_aggregator_order(
 p_event_id uuid,
 p_restaurant_id uuid,
 p_provider text,
 p_external_order_id text,
 p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 ev public.p0_aggregator_events%rowtype;
 ao public.aggregator_orders%rowtype;
 o public.orders%rowtype;
 it jsonb;
 item_id uuid;
 item_name text;
 qty integer;
 unit_price numeric;
 line_total numeric;
 total numeric;
 subtotal numeric;
 ext_item_id text;
 customer_name text;
 customer_phone text;
 address text;
 status text;
begin
 if not (auth.role()='service_role' or public.is_super_admin() or public.is_restaurant_member(p_restaurant_id)) then raise exception 'Restaurant access denied'; end if;
 select * into ev from public.p0_aggregator_events where id=p_event_id for update;
 if not found then raise exception 'Aggregator event not found'; end if;
 if ev.processed_order_id is not null then return jsonb_build_object('success',true,'duplicate',true,'order_id',ev.processed_order_id); end if;
 status:=lower(coalesce(p_payload->>'status',p_payload->'order'->>'status','received'));
 total:=coalesce(nullif(p_payload->>'total','')::numeric,nullif(p_payload->'order'->>'total','')::numeric,0);
 subtotal:=coalesce(nullif(p_payload->>'subtotal','')::numeric,nullif(p_payload->'order'->>'subtotal','')::numeric,total);
 customer_name:=coalesce(p_payload->>'customer_name',p_payload->'customer'->>'name',p_payload->'order'->'customer'->>'name');
 customer_phone:=coalesce(p_payload->>'customer_phone',p_payload->'customer'->>'phone',p_payload->'order'->'customer'->>'phone');
 address:=coalesce(p_payload->>'delivery_address',p_payload->'delivery_address'->>0,p_payload->'customer'->>'address',p_payload->'order'->'delivery_address');
 insert into public.orders(restaurant_id,source_type,source_id,source_label,status,subtotal,total_amount,payment_status,payment_method,customer_name,customer_phone,delivery_address,order_mode,client_request_id,overall_note,created_at,updated_at)
 values(p_restaurant_id,'aggregator',p_external_order_id,upper(p_provider),case when status in ('cancelled','rejected') then 'cancelled' else 'pending' end,subtotal,total,'unpaid',coalesce(p_payload->>'payment_method','online'),customer_name,customer_phone,address,'delivery',format('aggregator:%s:%s',p_provider,p_external_order_id),coalesce(p_payload->>'note',p_payload->'order'->>'note'),now(),now())
 on conflict (restaurant_id,client_request_id) do update set updated_at=now()
 returning * into o;
 if o.id is null then select * into o from public.orders where restaurant_id=p_restaurant_id and client_request_id=format('aggregator:%s:%s',p_provider,p_external_order_id) for update; end if;
 for it in select * from jsonb_array_elements(coalesce(p_payload->'items',p_payload->'order'->'items','[]'::jsonb)) loop
   ext_item_id:=coalesce(it->>'external_item_id',it->>'item_id',it->>'id');
   select m.menu_item_id into item_id from public.aggregator_item_mappings m where m.restaurant_id=p_restaurant_id and m.provider=p_provider and m.external_item_id=ext_item_id and m.active=true limit 1;
   item_name:=coalesce(it->>'name',it->>'item_name','Aggregator item');
   qty:=greatest(coalesce(nullif(it->>'quantity','')::integer,1),1);
   unit_price:=coalesce(nullif(it->>'unit_price','')::numeric,nullif(it->>'price','')::numeric,0);
   line_total:=coalesce(nullif(it->>'line_total','')::numeric,unit_price*qty);
   if not exists(select 1 from public.order_items oi where oi.order_id=o.id and coalesce(oi.variant_name,'')=coalesce(it->>'external_item_id',ext_item_id) and oi.item_name=item_name) then
     insert into public.order_items(order_id,item_id,quantity,item_name,unit_price,line_total,variant_name) values(o.id,item_id,qty,item_name,unit_price,line_total,ext_item_id);
   end if;
 end loop;
 insert into public.aggregator_orders(restaurant_id,integration_id,provider,external_order_id,order_id,status,payload,updated_at)
 select p_restaurant_id,ai.id,p_provider,p_external_order_id,o.id,status,p_payload,now() from public.aggregator_integrations ai where ai.restaurant_id=p_restaurant_id and ai.provider=p_provider limit 1
 on conflict (restaurant_id,provider,external_order_id) do update set order_id=excluded.order_id,status=excluded.status,payload=excluded.payload,updated_at=now();
 update public.p0_aggregator_events set processed_order_id=o.id,status='processed',processed_at=now(),updated_at=now(),attempts=attempts+1 where id=p_event_id;
 return jsonb_build_object('success',true,'duplicate',false,'order_id',o.id,'external_order_id',p_external_order_id);
exception when others then
 update public.p0_aggregator_events set status='failed',attempts=attempts+1,error_message=sqlerrm,updated_at=now() where id=p_event_id;
 raise;
end $$;
revoke all on function public.p0_4_process_aggregator_order(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.p0_4_process_aggregator_order(uuid,uuid,text,text,jsonb) to authenticated,service_role;
