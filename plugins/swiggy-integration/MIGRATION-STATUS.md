# Migration status — Swiggy

- Canonical boundary: `plugins/swiggy-integration/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/swiggy-integration/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/aggregator-control/`
- `app/api/aggregator/`
