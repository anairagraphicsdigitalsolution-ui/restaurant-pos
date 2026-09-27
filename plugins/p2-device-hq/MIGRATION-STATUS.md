# Migration status — P2 Device HQ

- Canonical boundary: `plugins/p2-device-hq/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p2-device-hq/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/device-hq/`
- `app/dashboard/device-health/`
- `app/api/device-hq/`
