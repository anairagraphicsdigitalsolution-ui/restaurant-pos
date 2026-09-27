# Migration status — Smart Notifications

- Canonical boundary: `plugins/smart-notifications/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/smart-notifications/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/notifications/`
