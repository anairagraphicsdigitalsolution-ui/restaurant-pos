-- Tenant Meta OAuth selection: secure Page/Instagram account chooser for Restaurant Admins.
create table if not exists public.marketing_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  platform text not null check(platform in ('facebook','instagram')),
  token_expires_at timestamptz,
  candidates jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);
alter table public.marketing_oauth_sessions enable row level security;
drop policy if exists marketing_oauth_sessions_owner on public.marketing_oauth_sessions;
create policy marketing_oauth_sessions_owner on public.marketing_oauth_sessions
for all to authenticated
using (user_id=auth.uid() and restaurant_id=public.current_restaurant_id())
with check (user_id=auth.uid() and restaurant_id=public.current_restaurant_id());
create index if not exists marketing_oauth_sessions_exp_idx on public.marketing_oauth_sessions(expires_at);
create index if not exists marketing_oauth_sessions_user_rest_idx on public.marketing_oauth_sessions(user_id,restaurant_id);
