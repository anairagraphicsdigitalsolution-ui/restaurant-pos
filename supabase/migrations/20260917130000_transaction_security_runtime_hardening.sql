BEGIN;
-- Keep SECURITY DEFINER execution isolated from caller-controlled search_path.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
  END LOOP;
END $$;
-- Exact duplicate item_id index; keep the application-named equivalent.
DROP INDEX IF EXISTS public.idx_fk_order_items_order_items_item_id_auto;
NOTIFY pgrst,'reload schema';
COMMIT;
