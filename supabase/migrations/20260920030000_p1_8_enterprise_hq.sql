-- Anaira P1.8 Enterprise HQ - production completion, additive/non-destructive.
create table if not exists public.enterprise_staff_movements (
 id uuid primary key default gen_random_uuid(), enterprise_id uuid not null references public.enterprise_groups(id) on delete cascade,
 staff_id uuid not null references auth.users(id) on delete cascade, from_restaurant_id uuid references public.restaurants(id) on delete set null,
 to_restaurant_id uuid not null references public.restaurants(id) on delete cascade, effective_date date not null default current_date,
 status text not null default 'requested' check(status in ('requested','approved','rejected','completed','cancelled')),
 requested_by uuid references auth.users(id) on delete set null, approved_by uuid references auth.users(id) on delete set null,
 requested_at timestamptz not null default now(), approved_at timestamptz, completed_at timestamptz, reason text, notes text, idempotency_key text,
 unique(enterprise_id,idempotency_key)
);
create index if not exists idx_ent_staff_move_enterprise on public.enterprise_staff_movements(enterprise_id,status,effective_date desc);
create index if not exists idx_ent_staff_move_staff on public.enterprise_staff_movements(staff_id,effective_date desc);

alter table public.enterprise_inventory_transfers add column if not exists idempotency_key text;
create unique index if not exists uq_ent_transfer_idempotency on public.enterprise_inventory_transfers(enterprise_id,idempotency_key) where idempotency_key is not null;

create index if not exists idx_ent_menu_prices_enterprise on public.enterprise_menu_prices(enterprise_id,restaurant_id,catalog_item_id);
create index if not exists idx_ent_devices_enterprise on public.enterprise_devices(enterprise_id,status,last_seen_at desc);
create index if not exists idx_ent_daily_snapshots_enterprise_date on public.enterprise_daily_snapshots(enterprise_id,business_date desc);

alter table public.enterprise_staff_movements enable row level security;
drop policy if exists enterprise_staff_movements_member_select on public.enterprise_staff_movements;
create policy enterprise_staff_movements_member_select on public.enterprise_staff_movements for select to authenticated using (exists(select 1 from public.enterprise_members m where m.enterprise_id=enterprise_staff_movements.enterprise_id and m.user_id=auth.uid()));

create or replace function public.p1_8_hq_summary(p_enterprise_id uuid,p_days integer default 30)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; allowed boolean; d integer:=least(greatest(coalesce(p_days,30),1),365); begin
 select exists(select 1 from public.enterprise_members where enterprise_id=p_enterprise_id and user_id=auth.uid()) into allowed; if not allowed then raise exception 'Enterprise access denied'; end if;
 select jsonb_build_object(
  'enterprise',(select to_jsonb(g) from enterprise_groups g where g.id=p_enterprise_id),
  'outlets',coalesce((select jsonb_agg(to_jsonb(o) order by o.outlet_name) from enterprise_outlets o where o.enterprise_id=p_enterprise_id and o.is_active),'[]'::jsonb),
  'members',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from enterprise_members m where m.enterprise_id=p_enterprise_id),'[]'::jsonb),
  'catalog',coalesce((select jsonb_agg(to_jsonb(c) order by c.category,c.name) from enterprise_menu_catalog c where c.enterprise_id=p_enterprise_id),'[]'::jsonb),
  'prices',coalesce((select jsonb_agg(to_jsonb(p)) from enterprise_menu_prices p where p.enterprise_id=p_enterprise_id),'[]'::jsonb),
  'transfers',coalesce((select jsonb_agg(to_jsonb(t) order by t.requested_at desc) from enterprise_inventory_transfers t where t.enterprise_id=p_enterprise_id),'[]'::jsonb),
  'approvals',coalesce((select jsonb_agg(to_jsonb(a) order by a.requested_at desc) from enterprise_approvals a where a.enterprise_id=p_enterprise_id and a.status='pending'),'[]'::jsonb),
  'staff_movements',coalesce((select jsonb_agg(to_jsonb(s) order by s.requested_at desc) from enterprise_staff_movements s where s.enterprise_id=p_enterprise_id),'[]'::jsonb),
  'devices',coalesce((select jsonb_agg(to_jsonb(x) order by x.last_seen_at desc nulls last) from enterprise_devices x where x.enterprise_id=p_enterprise_id),'[]'::jsonb),
  'targets',coalesce((select jsonb_agg(to_jsonb(t) order by t.target_period desc) from enterprise_targets t where t.enterprise_id=p_enterprise_id),'[]'::jsonb),
  'snapshots',coalesce((select jsonb_agg(to_jsonb(s) order by s.business_date desc) from enterprise_daily_snapshots s where s.enterprise_id=p_enterprise_id and s.business_date >= current_date-(d-1)),'[]'::jsonb)
 ) into r; return r;
end $$;
revoke all on function public.p1_8_hq_summary(uuid,integer) from public; grant execute on function public.p1_8_hq_summary(uuid,integer) to authenticated,service_role;

create or replace function public.p1_8_request_transfer(p_enterprise_id uuid,p_from uuid,p_to uuid,p_inventory_id uuid,p_item_name text,p_quantity numeric,p_unit text,p_idempotency_key text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$ declare x enterprise_inventory_transfers; begin
 if not exists(select 1 from enterprise_members where enterprise_id=p_enterprise_id and user_id=auth.uid() and role in('owner','enterprise_admin','operations','inventory_manager')) then raise exception 'Not authorized'; end if;
 if p_from=p_to or p_quantity<=0 then raise exception 'Invalid transfer'; end if;
 if not exists(select 1 from enterprise_outlets where enterprise_id=p_enterprise_id and restaurant_id=p_from and is_active) or not exists(select 1 from enterprise_outlets where enterprise_id=p_enterprise_id and restaurant_id=p_to and is_active) then raise exception 'Outlet not in enterprise'; end if;
 if p_idempotency_key is not null then select * into x from enterprise_inventory_transfers where enterprise_id=p_enterprise_id and idempotency_key=p_idempotency_key; if found then return to_jsonb(x); end if; end if;
 insert into enterprise_inventory_transfers(enterprise_id,from_restaurant_id,to_restaurant_id,inventory_id,item_name,quantity,unit,status,requested_by,requested_at,notes,idempotency_key) values(p_enterprise_id,p_from,p_to,p_inventory_id,p_item_name,p_quantity,p_unit,'requested',auth.uid(),now(),p_notes,p_idempotency_key) returning * into x;
 insert into enterprise_audit_logs(enterprise_id,restaurant_id,actor_id,action,entity_type,entity_id,metadata) values(p_enterprise_id,p_from,auth.uid(),'transfer_requested','inventory_transfer',x.id,jsonb_build_object('to_restaurant_id',p_to,'quantity',p_quantity,'item_name',p_item_name)); return to_jsonb(x); end $$;
revoke all on function public.p1_8_request_transfer(uuid,uuid,uuid,uuid,text,numeric,text,text,text) from public; grant execute on function public.p1_8_request_transfer(uuid,uuid,uuid,uuid,text,numeric,text,text,text) to authenticated;

create or replace function public.p1_8_decide_transfer(p_transfer_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$ declare t enterprise_inventory_transfers; src inventory; dst inventory; begin
 if p_status not in('approved','rejected','cancelled') then raise exception 'Invalid decision'; end if;
 select * into t from enterprise_inventory_transfers where id=p_transfer_id for update; if not found then raise exception 'Transfer not found'; end if;
 if not exists(select 1 from enterprise_members where enterprise_id=t.enterprise_id and user_id=auth.uid() and role in('owner','enterprise_admin','operations','inventory_manager')) then raise exception 'Not authorized'; end if;
 if t.status not in('requested','approved') then return to_jsonb(t); end if;
 if p_status='approved' then update enterprise_inventory_transfers set status='approved',approved_by=auth.uid(),approved_at=now(),notes=coalesce(p_note,notes) where id=t.id;
 else update enterprise_inventory_transfers set status=p_status,approved_by=auth.uid(),approved_at=now(),notes=coalesce(p_note,notes) where id=t.id; end if;
 select * into t from enterprise_inventory_transfers where id=t.id; insert into enterprise_audit_logs(enterprise_id,restaurant_id,actor_id,action,entity_type,entity_id,metadata) values(t.enterprise_id,t.from_restaurant_id,auth.uid(),'transfer_decision','inventory_transfer',t.id,jsonb_build_object('status',p_status)); return to_jsonb(t); end $$;
revoke all on function public.p1_8_decide_transfer(uuid,text,text) from public; grant execute on function public.p1_8_decide_transfer(uuid,text,text) to authenticated;

create or replace function public.p1_8_receive_transfer(p_transfer_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$ declare t enterprise_inventory_transfers; src_id uuid; dst_id uuid; begin
 select * into t from enterprise_inventory_transfers where id=p_transfer_id for update; if not found then raise exception 'Transfer not found'; end if;
 if not exists(select 1 from enterprise_members where enterprise_id=t.enterprise_id and user_id=auth.uid() and role in('owner','enterprise_admin','operations','inventory_manager')) then raise exception 'Not authorized'; end if;
 if t.status not in('approved','in_transit') then raise exception 'Transfer must be approved or in transit'; end if;
 if t.inventory_id is null then raise exception 'inventory_id is required for stock transfer'; end if;
 select id into src_id from inventory where id=t.inventory_id and restaurant_id=t.from_restaurant_id for update;
 if src_id is null then raise exception 'Source inventory item not found'; end if;
 if (select quantity from inventory where id=src_id) < t.quantity then raise exception 'Insufficient source stock'; end if;
 update inventory set quantity=quantity-t.quantity where id=src_id;
 select id into dst_id from inventory where restaurant_id=t.to_restaurant_id and name=(select name from inventory where id=src_id) limit 1;
 if dst_id is null then insert into inventory(restaurant_id,name,quantity,unit) select t.to_restaurant_id,name,0,unit from inventory where id=src_id returning id into dst_id; end if;
 update inventory set quantity=quantity+t.quantity where id=dst_id;
 insert into inventory_movements(restaurant_id,inventory_id,movement_type,quantity,unit,reference_type,reference_id,reason,created_by) values(t.from_restaurant_id,src_id,'transfer_out',-t.quantity,t.unit,'enterprise_transfer',t.id,'Enterprise HQ transfer',auth.uid()),(t.to_restaurant_id,dst_id,'transfer_in',t.quantity,t.unit,'enterprise_transfer',t.id,'Enterprise HQ transfer',auth.uid());
 update enterprise_inventory_transfers set status='received',received_at=now() where id=t.id;
 insert into enterprise_audit_logs(enterprise_id,restaurant_id,actor_id,action,entity_type,entity_id,metadata) values(t.enterprise_id,t.to_restaurant_id,auth.uid(),'transfer_received','inventory_transfer',t.id,jsonb_build_object('quantity',t.quantity));
 select * into t from enterprise_inventory_transfers where id=t.id; return to_jsonb(t); end $$;
revoke all on function public.p1_8_receive_transfer(uuid) from public; grant execute on function public.p1_8_receive_transfer(uuid) to authenticated;

create or replace function public.p1_8_request_staff_move(p_enterprise_id uuid,p_staff_id uuid,p_from uuid,p_to uuid,p_effective_date date,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare x enterprise_staff_movements; begin
 if not exists(select 1 from enterprise_members where enterprise_id=p_enterprise_id and user_id=auth.uid() and role in('owner','enterprise_admin','operations')) then raise exception 'Not authorized'; end if;
 if p_from=p_to then raise exception 'Source and destination outlet must differ'; end if;
 if p_idempotency_key is not null then select * into x from enterprise_staff_movements where enterprise_id=p_enterprise_id and idempotency_key=p_idempotency_key; if found then return to_jsonb(x); end if; end if;
 insert into enterprise_staff_movements(enterprise_id,staff_id,from_restaurant_id,to_restaurant_id,effective_date,reason,requested_by,idempotency_key) values(p_enterprise_id,p_staff_id,p_from,p_to,coalesce(p_effective_date,current_date),p_reason,auth.uid(),p_idempotency_key) returning * into x;
 insert into enterprise_audit_logs(enterprise_id,restaurant_id,actor_id,action,entity_type,entity_id,metadata) values(p_enterprise_id,p_from,auth.uid(),'staff_move_requested','staff_movement',x.id,jsonb_build_object('to_restaurant_id',p_to,'staff_id',p_staff_id)); return to_jsonb(x); end $$;
revoke all on function public.p1_8_request_staff_move(uuid,uuid,uuid,uuid,date,text,text) from public; grant execute on function public.p1_8_request_staff_move(uuid,uuid,uuid,uuid,date,text,text) to authenticated;

create or replace function public.p1_8_decide_approval(p_approval_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$ declare a enterprise_approvals; begin
 if p_status not in('approved','rejected') then raise exception 'Invalid approval status'; end if; select * into a from enterprise_approvals where id=p_approval_id for update; if not found then raise exception 'Approval not found'; end if;
 if not exists(select 1 from enterprise_members where enterprise_id=a.enterprise_id and user_id=auth.uid() and role in('owner','enterprise_admin','finance','operations','menu_manager','inventory_manager')) then raise exception 'Not authorized'; end if;
 update enterprise_approvals set status=p_status,approved_by=auth.uid(),decided_at=now(),decision_note=p_note where id=a.id; select * into a from enterprise_approvals where id=a.id;
 insert into enterprise_audit_logs(enterprise_id,restaurant_id,actor_id,action,entity_type,entity_id,metadata) values(a.enterprise_id,a.restaurant_id,auth.uid(),'approval_decided','approval',a.id,jsonb_build_object('status',p_status)); return to_jsonb(a); end $$;
revoke all on function public.p1_8_decide_approval(uuid,text,text) from public; grant execute on function public.p1_8_decide_approval(uuid,text,text) to authenticated;

create or replace function public.p1_8_consolidated_reports(p_enterprise_id uuid,p_start date,p_end date)
returns jsonb language plpgsql security definer set search_path=public as $$ declare r jsonb; begin
 if not exists(select 1 from enterprise_members where enterprise_id=p_enterprise_id and user_id=auth.uid()) then raise exception 'Enterprise access denied'; end if;
 select jsonb_build_object(
 'outlets',coalesce((select jsonb_agg(q order by q->>'outlet_name') from (select jsonb_build_object('restaurant_id',o.restaurant_id,'outlet_name',coalesce(o.outlet_name,r.name),'revenue',coalesce((select sum(total_amount) from orders x where x.restaurant_id=o.restaurant_id and x.created_at::date between p_start and p_end and coalesce(x.status,'') not in('cancelled','voided')),0),'orders',coalesce((select count(*) from orders x where x.restaurant_id=o.restaurant_id and x.created_at::date between p_start and p_end and coalesce(x.status,'') not in('cancelled','voided')),0),'expenses',coalesce((select sum(amount) from expenses e where e.restaurant_id=o.restaurant_id and e.expense_date between p_start and p_end),0)) q from enterprise_outlets o join restaurants r on r.id=o.restaurant_id where o.enterprise_id=p_enterprise_id and o.is_active) q),'[]'::jsonb),
 'group_revenue',coalesce((select sum(total_amount) from orders x where x.restaurant_id in(select restaurant_id from enterprise_outlets where enterprise_id=p_enterprise_id) and x.created_at::date between p_start and p_end and coalesce(x.status,'') not in('cancelled','voided')),0),
 'group_expenses',coalesce((select sum(amount) from expenses e where e.restaurant_id in(select restaurant_id from enterprise_outlets where enterprise_id=p_enterprise_id) and e.expense_date between p_start and p_end),0)
 ) into r; return r; end $$;
revoke all on function public.p1_8_consolidated_reports(uuid,date,date) from public; grant execute on function public.p1_8_consolidated_reports(uuid,date,date) to authenticated,service_role;

create or replace function public.p1_8_group_accounting(p_enterprise_id uuid,p_start date,p_end date)
returns jsonb language plpgsql security definer set search_path=public as $$ begin
 if not exists(select 1 from enterprise_members where enterprise_id=p_enterprise_id and user_id=auth.uid()) then raise exception 'Enterprise access denied'; end if;
 return jsonb_build_object('journal',coalesce((select jsonb_agg(to_jsonb(j) order by j.entry_date,j.created_at) from p0_accounting_journal_entries j where j.restaurant_id in(select restaurant_id from enterprise_outlets where enterprise_id=p_enterprise_id) and j.entry_date between p_start and p_end),'[]'::jsonb)); end $$;
revoke all on function public.p1_8_group_accounting(uuid,date,date) from public; grant execute on function public.p1_8_group_accounting(uuid,date,date) to authenticated,service_role;
