# Migration status — P1 Enterprise HQ

- Canonical boundary: `plugins/p1-enterprise-hq/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p1-enterprise-hq/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/enterprise-hq/`
- `app/api/enterprise/`
