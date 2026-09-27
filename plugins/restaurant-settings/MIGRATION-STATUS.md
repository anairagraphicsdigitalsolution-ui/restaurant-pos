# Migration status — Restaurant Settings

- Canonical boundary: `plugins/restaurant-settings/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/restaurant-settings/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/business/`
