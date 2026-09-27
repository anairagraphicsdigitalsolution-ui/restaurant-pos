# Migration status — P1 Supplier Automation

- Canonical boundary: `plugins/p1-supplier-automation/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p1-supplier-automation/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/procurement/`
- `app/api/inventory/`
