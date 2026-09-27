# Migration status — P1 Marketing Hub

- Canonical boundary: `plugins/p1-marketing-hub/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p1-marketing-hub/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/marketing/`
- `app/dashboard/marketing-automation/`
- `app/api/marketing/`
