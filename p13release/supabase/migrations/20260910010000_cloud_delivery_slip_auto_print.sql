alter table public.print_jobs add column if not exists dedupe_key text;
create unique index if not exists ux_print_jobs_dedupe_key on public.print_jobs(restaurant_id,dedupe_key) where dedupe_key is not null;
