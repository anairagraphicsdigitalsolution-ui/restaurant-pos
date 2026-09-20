-- STAGE 1 VERIFICATION
-- Run this after applying stage1_security_hardening.sql.

-- 1) Every public application table should have RLS enabled.
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2) Review the new policies.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3) Review anonymous grants. Only the intended QR-menu reads
-- and QR-order inserts should remain for anon.
SELECT
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- 4) Review the helper function privileges.
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'current_restaurant_id',
    'current_user_role',
    'is_super_admin',
    'is_admin',
    'is_staff_or_admin',
    'is_restaurant_member',
    'can_manage_restaurant',
    'decrease_inventory',
    'set_whatsapp_config'
  )
ORDER BY routine_name, grantee, privilege_type;
