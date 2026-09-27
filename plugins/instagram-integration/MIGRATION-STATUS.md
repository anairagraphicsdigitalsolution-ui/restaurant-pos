# Migration status — Instagram

- Canonical boundary: `plugins/instagram-integration/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/instagram-integration/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/social/`
- `app/api/social/`
