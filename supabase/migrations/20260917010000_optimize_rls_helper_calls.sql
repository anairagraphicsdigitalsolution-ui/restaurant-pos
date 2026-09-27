-- Anaira performance hardening: cache stable RLS helper results per statement.
-- This preserves the existing authorization logic while preventing helper
-- functions that read profiles from being re-evaluated once per row during
-- Postgres/Supabase Realtime scans.
DO $$
DECLARE
  r record;
  q text;
  wc text;
BEGIN
  FOR r IN
    SELECT p.polname,
           c.relname AS table_name,
           n.nspname AS schema_name,
           p.polrelid,
           p.polqual,
           p.polwithcheck
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    q := CASE WHEN r.polqual IS NULL THEN NULL ELSE pg_get_expr(r.polqual, r.polrelid) END;
    wc := CASE WHEN r.polwithcheck IS NULL THEN NULL ELSE pg_get_expr(r.polwithcheck, r.polrelid) END;

    IF q IS NOT NULL THEN
      q := replace(q, 'current_restaurant_id()', '(select public.current_restaurant_id())');
      q := replace(q, 'current_user_role()', '(select public.current_user_role())');
      q := replace(q, 'is_super_admin()', '(select public.is_super_admin())');
      q := replace(q, 'is_staff_or_admin()', '(select public.is_staff_or_admin())');
      q := replace(q, 'is_admin()', '(select public.is_admin())');
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.polname, r.schema_name, r.table_name, q);
    END IF;

    IF wc IS NOT NULL THEN
      wc := replace(wc, 'current_restaurant_id()', '(select public.current_restaurant_id())');
      wc := replace(wc, 'current_user_role()', '(select public.current_user_role())');
      wc := replace(wc, 'is_super_admin()', '(select public.is_super_admin())');
      wc := replace(wc, 'is_staff_or_admin()', '(select public.is_staff_or_admin())');
      wc := replace(wc, 'is_admin()', '(select public.is_admin())');
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.polname, r.schema_name, r.table_name, wc);
    END IF;
  END LOOP;
END $$;

ANALYZE public.profiles;
ANALYZE public.notifications;
ANALYZE public.orders;
ANALYZE public.menu_items;
ANALYZE public.restaurant_plugins;
ANALYZE public.print_jobs;
ANALYZE public.restaurant_subscriptions;
