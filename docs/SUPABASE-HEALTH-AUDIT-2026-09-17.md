# Anaira Supabase / Cloud Health Audit — 2026-09-17

## Confirmed database evidence

Project: Anaira Graphics Saas (`vgzwzvmuylsoqjkqfcnw`)

- Project is reachable and was observed in `ACTIVE_HEALTHY` state during the audit.
- Live QR restaurant/table/menu context was previously verified against the connected project.
- A real `create_public_qr_order()` call was successfully executed inside a transaction and rolled back after verification.
- `pg_stat_statements` shows substantial historical Realtime workload: `realtime.list_changes` — 424,183 calls.
- `claim_next_print_job` — 1,752 calls, mean ~74.8 ms.
- `get_restaurant_plan` — 1,508 calls, mean ~201.8 ms.
- `restaurant_plugins` lookup — 11,368 calls, mean ~9.4 ms.
- Profile lookup — 5,072 calls, mean ~6.5 ms.
- The live `profiles` table is very small (2 rows) and already has a primary key and `restaurant_id` index.
- Realtime publication currently contains `inventory`, `notifications`, `order_items`, and `orders`.

## Primary application-side pressure found

1. `components/CloudPrintAgent.jsx` polled `claim_next_print_job` every 2.5 seconds on restaurant application pages. This was changed to a 10-second fallback cadence.
2. `Sidebar.tsx` independently called `get_restaurant_plan` even though `AuthProvider` had already fetched the same plan during authentication. The duplicate plan request was removed; plan name/expiry/features are now carried through the Auth context.
3. Realtime notification failures retried every 4 seconds indefinitely. Retry is now exponential with a 30-second cap.
4. Calling-device plugin failures retried every 5 seconds indefinitely. Retry is now exponential with a 60-second cap.
5. Dashboard cloud failures retried up to three times, including client failures. It now performs at most one retry and does not retry 4xx responses.
6. The RLS policy set contains many direct calls to stable helper functions such as `current_restaurant_id()` and `is_super_admin()`. These can be evaluated repeatedly during row-level/realtime processing. The live database was hardened so these no-argument helper calls are wrapped as statement-level scalar subqueries, preserving authorization semantics while allowing PostgreSQL to reuse the result within a statement.

## Important interpretation

The database is not intrinsically broken or empty. The strongest evidence points to workload amplification: Realtime processing plus repeated application polling/RLS helper evaluation. The current QR timeout can therefore be a downstream symptom when the application server is waiting on a Cloud Supabase request during a period of contention/network delay.

## Files changed in this audit build

- `components/AuthProvider.tsx`
- `components/Sidebar.tsx`
- `components/CloudPrintAgent.jsx`
- `components/RealtimeNotificationProvider.tsx`
- `components/CallingRuntimeProvider.tsx`
- `app/dashboard/page.js`
- `supabase/migrations/20260917010000_optimize_rls_helper_calls.sql`

No restaurant data, menu data, order data, plugin records, or existing feature modules were intentionally deleted by this audit patch.
