# Migration status — QR Print Center

- Canonical boundary: `plugins/qr-print-center/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/qr-print-center/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/qr/`
- `app/api/qr/`
