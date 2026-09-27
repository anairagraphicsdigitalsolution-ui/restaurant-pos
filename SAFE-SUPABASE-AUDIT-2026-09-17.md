# Anaira POS — Safe Supabase Audit / Repair

Date: 2026-09-17

## Scope
- Audited the supplied Anaira SaaS v59 Calling Device ZIP.
- Audited the connected Supabase project directly.
- No application/business data was deleted.
- No broad index cleanup was performed.

## Remote database state at audit time
- PostgreSQL: 17.x
- Database size: about 30 MB
- Connections: 24 / 60 during initial check
- Public tables inspected: 200; RLS enabled on all 200
- Database uptime at audit: about 16.8 days
- Current SQL requests were executing successfully.
- Realtime replication connection was in normal WalSenderWaitForWal state.

## Safe repairs applied remotely
1. Removed one exact duplicate index on `public.restaurant_service_calls`:
   `idx_restaurant_service_calls_restaurant_order_open`
2. Added a narrow index on `public.profiles (id, restaurant_id, role)` to support frequent authenticated profile/role lookups.
3. Refreshed planner statistics for key POS/realtime tables.

## Deliberately NOT changed
- No orders, payments, customers, menu items, restaurants, staff, plugin rows, or settings were deleted.
- No mass deletion of the 257 indexes reported as unused by the advisor. Those are candidates, not proof of being safe to remove, and the POS has many future/runtime paths.
- No broad RLS-policy deletion. The advisor reports 116 multiple-permissive-policy warnings, but several are compatibility/authorization policies and require per-table behavioral tests before consolidation.
- No SECURITY DEFINER functions were removed or converted. Some are authentication/authorization helpers and QR/runtime functions; changing them blindly can break login or public QR workflows.

## Important project findings
- The supplied ZIP contains 159 migration files and the remote database has newer timestamped migrations than the ZIP's timestamped migration filenames. The remote database is therefore the authoritative current state; local migration history should be synchronized before a fresh deployment.
- The ZIP contains 694 files and includes the Calling Device implementation.
- Calling Device custom audio is present in the current Super Admin plugin page and restaurant runtime, with per-event assets.
- The ZIP's Calling Device runtime supports native Android TTS when a bridge exists and browser speech fallback otherwise.
- There are several unbounded `select('*')`/large reads in Super Admin analytics/admin pages. These should be paginated or column-scoped in a later performance pass; they are not safe to mass-edit without acceptance testing.

## Supabase advisor findings remaining
- 257 unused-index INFO findings remain. They should be reviewed by workload, not deleted wholesale.
- 116 multiple-permissive-policy WARN findings remain. They are mostly policy consolidation opportunities and need table-by-table regression testing.
- SECURITY DEFINER execution warnings remain for several functions. These need role-by-role review before revoking execution.
- Leaked-password protection is reported disabled and can be enabled from Supabase Auth settings.

## Migration included in this ZIP
`supabase/migrations/20260917200500_safe_performance_cleanup.sql`

This migration is intentionally limited to the safe changes already applied remotely.
