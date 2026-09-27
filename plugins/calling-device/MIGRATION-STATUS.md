# Migration status — Calling Device

- Canonical boundary: `plugins/calling-device/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/calling-device/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/calling/`
- `app/api/calling/`
