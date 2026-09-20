-- P2.4 Customer Display
-- Deployed to Supabase project vgzwzvmuylsoqjkqfcnw.
-- Existing QR/payment tables and APIs are preserved; this migration only adds display state/registration.

create table if not exists public.p2_4_customer_displays (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 display_code text not null, name text not null, device_id text, status text not null default 'offline' check(status in ('active','inactive','offline')),
 version text, last_seen_at timestamptz, config jsonb not null default '{}'::jsonb, branding jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(restaurant_id,display_code)
);
create table if not exists public.p2_4_display_sessions (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 display_id uuid not null references public.p2_4_customer_displays(id) on delete cascade, session_key text not null,
 status text not null default 'active' check(status in ('active','payment','success','thank_you','idle')),
 state jsonb not null default '{}'::jsonb, idempotency_key text, updated_at timestamptz not null default now(), created_at timestamptz not null default now(),
 unique(restaurant_id,session_key)
);
create index if not exists p2_4_display_heartbeat_idx on public.p2_4_customer_displays(restaurant_id,status,last_seen_at);
create index if not exists p2_4_display_sessions_idx on public.p2_4_display_sessions(display_id,updated_at desc);
alter table public.p2_4_customer_displays enable row level security;
alter table public.p2_4_display_sessions enable row level security;

create or replace function public.p2_4_publish_display_state(p_restaurant_id uuid,p_display_id uuid,p_session_key text,p_state jsonb,p_status text default 'active') returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_session public.p2_4_display_sessions%rowtype;
begin
 if not exists(select 1 from public.p2_4_customer_displays where id=p_display_id and restaurant_id=p_restaurant_id and status <> 'inactive') then raise exception 'Display not found or inactive'; end if;
 insert into public.p2_4_display_sessions(restaurant_id,display_id,session_key,status,state,updated_at) values(p_restaurant_id,p_display_id,p_session_key,p_status,p_state,now())
 on conflict(restaurant_id,session_key) do update set display_id=excluded.display_id,status=excluded.status,state=excluded.state,updated_at=now() returning * into v_session;
 update public.p2_4_customer_displays set status='active',last_seen_at=now(),updated_at=now() where id=p_display_id and restaurant_id=p_restaurant_id;
 return jsonb_build_object('success',true,'session_id',v_session.id,'updated_at',v_session.updated_at);
end $$;

create or replace function public.p2_4_display_heartbeat(p_display_code text,p_version text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v public.p2_4_customer_displays%rowtype;
begin
 update public.p2_4_customer_displays set status='active',version=p_version,last_seen_at=now(),updated_at=now() where display_code=p_display_code and status <> 'inactive' returning * into v;
 if not found then raise exception 'Display not found'; end if;
 return jsonb_build_object('success',true,'display_id',v.id,'restaurant_id',v.restaurant_id,'config',v.config,'branding',v.branding);
end $$;
revoke all on function public.p2_4_publish_display_state(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.p2_4_display_heartbeat(text,text) from public,anon,authenticated;
grant execute on function public.p2_4_publish_display_state(uuid,uuid,text,jsonb,text) to service_role;
grant execute on function public.p2_4_display_heartbeat(text,text) to service_role;
