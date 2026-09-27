# Migration status — P1 Supplier Portal

- Canonical boundary: `plugins/p1-supplier-portal/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p1-supplier-portal/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/supplier-portal/`
