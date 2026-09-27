# Migration status — A4 Invoice Printing

- Canonical boundary: `plugins/a4-invoice/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/a4-invoice/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/printing/`
- `app/api/printing/`
