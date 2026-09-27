# Cashfree Payment Gateway

Canonical plugin boundary. Existing source is preserved in-place during this migration.

## Current source locations
- `app/dashboard/payment-gateway`
- `app/api/payments`

## Rules
- Do not delete existing implementation during migration.
- Do not delete or alter existing Supabase tables, columns, RPCs, functions, data, RLS, or migrations.
- Keep configuration owned by this plugin and retained when disabled.
- Operation Hub provides infrastructure/integration transport; it does not absorb business ownership.
