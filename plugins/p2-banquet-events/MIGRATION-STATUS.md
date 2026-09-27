# Migration status — P2 Banquet / Events / Catering

- Canonical boundary: `plugins/p2-banquet-events/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p2-banquet-events/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/banquet/`
- `app/dashboard/banquet-operations/`
- `app/api/banquet/`
