-- Custom per-event Calling Device audio assets.
-- The server-side upload route uses the service role; public read is required
-- so the browser/Android Calling Device can play the selected audio URL.
insert into storage.buckets (id, name, public)
values ('calling-voice-media', 'calling-voice-media', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Calling voice media public read') then
    create policy "Calling voice media public read" on storage.objects for select using (bucket_id = 'calling-voice-media');
  end if;
end $$;

-- Keep client writes/deletes blocked; authenticated admin API routes use the
-- Supabase service role and therefore bypass these policies.
