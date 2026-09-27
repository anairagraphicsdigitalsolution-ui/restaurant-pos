# Migration status — Facebook

- Canonical boundary: `plugins/facebook-integration/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/facebook-integration/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/social/`
- `app/api/social/`
