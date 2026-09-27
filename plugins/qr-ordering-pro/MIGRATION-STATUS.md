# Migration status — Advanced QR Ordering

- Canonical boundary: `plugins/qr-ordering-pro/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/qr-ordering-pro/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/qr/`
- `app/api/qr/`
- `app/api/qr-menu/`
