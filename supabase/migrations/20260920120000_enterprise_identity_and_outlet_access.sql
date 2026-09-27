-- P1.8 Enterprise identity + outlet access hardening.
-- Additive only. No business/order/menu data is deleted.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists display_name text;
create unique index if not exists ux_profiles_username_lower
  on public.profiles (lower(username)) where username is not null and btrim(username) <> '';

alter table public.restaurants add column if not exists code text;
create unique index if not exists ux_restaurants_code_lower
  on public.restaurants (lower(code)) where code is not null and btrim(code) <> '';

alter table public.enterprise_outlets add column if not exists is_main_branch boolean not null default false;
alter table public.enterprise_outlets add column if not exists admin_username text;
create index if not exists idx_enterprise_outlets_main_branch
  on public.enterprise_outlets(enterprise_id,is_main_branch) where is_main_branch=true;

-- Only one main branch per enterprise.
create unique index if not exists ux_enterprise_one_main_branch
  on public.enterprise_outlets(enterprise_id) where is_main_branch=true;

-- Keep the existing enterprise membership model, but make the owner role explicit.
create index if not exists idx_enterprise_members_owner
  on public.enterprise_members(enterprise_id,user_id,role);

-- Username is an application login alias; passwords remain entirely in Supabase Auth.
comment on column public.profiles.username is 'Unique login alias for Anaira users; never stores a password.';
comment on column public.enterprise_outlets.admin_username is 'Outlet admin login alias; password remains in Supabase Auth.';
