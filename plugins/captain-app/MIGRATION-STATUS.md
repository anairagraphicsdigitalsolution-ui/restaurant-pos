# Migration status — Captain / Waiter App

- Canonical boundary: `plugins/captain-app/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/captain-app/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/api/mobile/`
