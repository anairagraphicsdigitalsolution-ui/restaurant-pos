# Migration status — Zomato

- Canonical boundary: `plugins/zomato-integration/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/zomato-integration/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/aggregator-control/`
- `app/api/aggregator/`
