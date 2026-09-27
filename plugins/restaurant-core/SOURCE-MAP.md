# Restaurant Core

Canonical plugin boundary. Existing source is preserved in-place during this migration.

## Current source locations
- `app/dashboard/restaurant-core`
- `app/api/restaurant`
- `app/dashboard/tables`
- `app/dashboard/cash-closing`
- `app/dashboard/customer-display-control`
- `app/order`
- `app/billing`
- `app/kitchen`
- `app/api/orders`
- `app/api/billing`
- `app/api/kitchen`
- `plugins/pos`

## Rules
- Do not delete existing implementation during migration.
- Do not delete or alter existing Supabase tables, columns, RPCs, functions, data, RLS, or migrations.
- Keep configuration owned by this plugin and retained when disabled.
- Operation Hub provides infrastructure/integration transport; it does not absorb business ownership.
