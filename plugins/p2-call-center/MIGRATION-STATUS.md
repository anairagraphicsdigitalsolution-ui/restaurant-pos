# Migration status — P2 Call Center

- Canonical boundary: `plugins/p2-call-center/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p2-call-center/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/call-center/`
- `app/api/call-center/`
