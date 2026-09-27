# Migration status — Restaurant Core

- Canonical boundary: `plugins/restaurant-core/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/restaurant-core/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/restaurant-core/`
- `app/api/restaurant/`
- `app/dashboard/tables/`
- `app/dashboard/cash-closing/`
- `app/dashboard/customer-display-control/`
- `app/order/`
- `app/billing/`
- `app/kitchen/`
- `app/api/orders/`
- `app/api/billing/`
- `app/api/kitchen/`
- `plugins/pos/`
