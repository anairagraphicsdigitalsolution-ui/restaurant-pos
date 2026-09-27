-- Anaira cloud print bridge: Supabase is the print-job queue.
-- A trusted Android Anaira POS device consumes the queue and writes ESC/POS
-- bytes to the locally connected Bluetooth printer. No localhost bridge is required.

alter table public.print_jobs
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by text;

create index if not exists idx_print_jobs_cloud_queue
  on public.print_jobs(restaurant_id, status, created_at)
  where status in ('queued','printing');

create or replace function public.claim_next_print_job(p_restaurant_id uuid, p_agent_id text)
returns setof public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.print_jobs;
begin
  if p_restaurant_id is null or not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_job
  from public.print_jobs
  where restaurant_id = p_restaurant_id
    and status = 'queued'
    and (claimed_at is null or claimed_at < now() - interval '2 minutes')
  order by created_at
  for update skip locked
  limit 1;

  if v_job.id is null then
    return;
  end if;

  update public.print_jobs
  set status = 'printing',
      claimed_at = now(),
      claimed_by = left(coalesce(p_agent_id, 'anaira-agent'), 160),
      attempts = coalesce(attempts, 0) + 1
  where id = v_job.id
  returning * into v_job;

  return next v_job;
end;
$$;

revoke all on function public.claim_next_print_job(uuid,text) from public;
grant execute on function public.claim_next_print_job(uuid,text) to authenticated;
