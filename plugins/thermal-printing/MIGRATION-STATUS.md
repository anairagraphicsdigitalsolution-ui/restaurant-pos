# Migration status — Thermal / KOT Printing

- Canonical boundary: `plugins/thermal-printing/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/thermal-printing/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/printing/`
- `app/api/printing/`
