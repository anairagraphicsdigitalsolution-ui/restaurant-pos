# Migration status — Hardware Print Queue

- Canonical boundary: `plugins/hardware-print-queue/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/hardware-print-queue/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/printing/`
- `app/api/printing/`
