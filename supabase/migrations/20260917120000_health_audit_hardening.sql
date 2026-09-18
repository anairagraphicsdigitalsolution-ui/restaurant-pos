-- Anaira production health hardening
-- Safe: removes only exact duplicate policies, adds FK indexes when absent,
-- and protects archived backup tables. No application data is deleted.
DROP POLICY IF EXISTS "restaurant scoped order_holds" ON public.order_holds;
DROP POLICY IF EXISTS "restaurant members deliveries v2" ON public.restaurant_deliveries;

DROP POLICY IF EXISTS "backup_tables_no_api_access" ON public.anaira_sync_events_disabled_backup;
CREATE POLICY "backup_tables_no_api_access" ON public.anaira_sync_events_disabled_backup
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "backup_tables_no_api_access" ON public.anaira_sync_state_disabled_backup;
CREATE POLICY "backup_tables_no_api_access" ON public.anaira_sync_state_disabled_backup
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.payment_webhook_events FROM anon, authenticated;

DO $$
DECLARE r record; idx_name text; cols_sql text;
BEGIN
  FOR r IN
    SELECT c.conrelid, c.conname, c.conkey, c.conrelid::regclass AS relname
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    WHERE c.contype='f' AND n.nspname='public'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i WHERE i.indrelid=r.conrelid AND i.indisvalid
      AND (i.indkey::smallint[])[1:cardinality(r.conkey)] = r.conkey
    ) THEN
      SELECT string_agg(format('%I',a.attname),', ' ORDER BY u.ord) INTO cols_sql
      FROM unnest(r.conkey) WITH ORDINALITY u(attnum,ord)
      JOIN pg_attribute a ON a.attrelid=r.conrelid AND a.attnum=u.attnum;
      idx_name := left('idx_fk_'||replace(replace(r.relname::text,'"',''),'.','_')||'_'||replace(r.conname,'_fkey','')||'_auto',60);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)',idx_name,r.relname,cols_sql);
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
