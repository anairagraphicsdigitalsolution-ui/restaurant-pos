-- Production hardening: reduce SECURITY DEFINER exposure and optimize RLS init plans.
-- No application data is deleted or reset.
BEGIN;

-- SECURITY DEFINER routines are privileged. Remove the default PUBLIC grant and
-- authenticated direct execution. Server-side service_role remains allowed.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- These routines are intentionally called directly by authenticated browser code.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'admin_save_restaurant_theme',
        'apply_discount_rule',
        'claim_next_print_job',
        'get_restaurant_plan',
        'preview_order_offers',
        'seed_default_loyalty_config'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- Supabase advisor's auth-init-plan warning is addressed by evaluating auth.uid()
-- once per statement rather than once per row. Existing policy semantics remain
-- unchanged.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%')
  LOOP
    IF r.qual IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        r.policyname, r.schemaname, r.tablename,
        replace(r.qual, 'auth.uid()', '(select auth.uid())')
      );
    END IF;
    IF r.with_check IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        r.policyname, r.schemaname, r.tablename,
        replace(r.with_check, 'auth.uid()', '(select auth.uid())')
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
