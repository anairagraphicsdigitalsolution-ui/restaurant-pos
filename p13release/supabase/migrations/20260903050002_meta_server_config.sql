create table if not exists public.platform_marketing_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platform_marketing_settings enable row level security;
drop policy if exists platform_marketing_settings_sa on public.platform_marketing_settings;
create policy platform_marketing_settings_sa on public.platform_marketing_settings
for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop trigger if exists trg_platform_marketing_settings_updated on public.platform_marketing_settings;
create trigger trg_platform_marketing_settings_updated before update on public.platform_marketing_settings
for each row execute function public.touch_marketing_updated_at();
