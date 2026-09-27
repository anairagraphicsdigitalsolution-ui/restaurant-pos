# Migration status — P0 System Reliability

- Canonical boundary: `plugins/p0-system-reliability/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p0-system-reliability/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/system-ops/`
- `app/api/webhooks/`
- `app/api/local/`
