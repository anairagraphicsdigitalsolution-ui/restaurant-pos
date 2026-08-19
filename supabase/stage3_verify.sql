-- STAGE 3 VERIFICATION
-- Run after applying the migration.

-- 1. New order/billing fields
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('orders','order_items','offers','reservations')
ORDER BY table_name, ordinal_position;

-- 2. New business tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'invoice_sequences',
    'audit_logs',
    'inventory_transactions'
  )
ORDER BY table_name;

-- 3. Stage 3 functions
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'stage3_%'
ORDER BY routine_name;

-- 4. Realtime publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN ('orders','order_items','inventory')
ORDER BY tablename;

-- 5. Audit / inventory ledger should not accept direct client writes.
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND table_name IN ('audit_logs','inventory_transactions','invoice_sequences')
ORDER BY table_name, privilege_type;
