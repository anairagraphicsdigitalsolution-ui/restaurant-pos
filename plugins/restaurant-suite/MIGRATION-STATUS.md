# Migration status — Restaurant Suite

- Canonical boundary: `plugins/restaurant-suite/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/restaurant-suite/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/restaurant-suite/`
- `app/api/restaurant-suite/`
- `app/api/restaurant-operations/`
- `app/dashboard/inventory/`
- `app/dashboard/procurement/`
- `app/dashboard/production-planning/`
- `app/dashboard/delivery/`
- `app/dashboard/aggregator-control/`
- `app/api/inventory/`
- `app/api/delivery/`
- `app/api/aggregator/`
