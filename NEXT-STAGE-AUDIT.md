# Next Stage Audit — 2026-09-17

## Applied to production
- SECURITY DEFINER execution was narrowed from PUBLIC/anon/authenticated to service_role by default, with explicitly required authenticated RPCs restored.
- RLS policies containing direct `auth.uid()` calls were converted to statement-level `(select auth.uid())` evaluation where applicable.
- Exact duplicate RLS policies are now 0 in the production duplicate-policy check.
- `payment_webhook_events` remains server-only.
- `payment_gateway_configs` retains restaurant-scoped RLS and authenticated CRUD required by the Payment Gateway admin screen.
- FK indexes were added only when missing; existing indexes were not mass-deleted.
- POS/KDS/print polling was reduced and realtime wake-up paths are retained.

## Important validation status
- Production Supabase migrations applied successfully through the current hardening stage.
- QR backend smoke test was previously verified with a rolled-back order transaction.
- Source-level payment gateway usage was audited before restoring authenticated access.
- A full Next.js build/typecheck still requires dependencies to be installed in a normal development/CI environment; this environment does not contain `node_modules`.

## Deliberately not mass-cleaned
Supabase advisor reports many "multiple permissive policy" and "unused index" findings. These are not automatically destructive cleanup targets: several policies intentionally combine role/super-admin/member access, and unused indexes can still be useful for low-frequency workflows. Only exact duplicate policies were removed automatically.
