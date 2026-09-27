# Migration status — P1 Advanced Reporting

- Canonical boundary: `plugins/p1-advanced-reporting/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p1-advanced-reporting/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/reports/`
- `app/api/reports/`
