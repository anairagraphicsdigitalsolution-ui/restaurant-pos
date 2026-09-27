# Migration status — P2 Advanced Kiosk

- Canonical boundary: `plugins/p2-advanced-kiosk/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p2-advanced-kiosk/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/kiosks/`
- `app/dashboard/kiosk-control/`
- `app/api/kiosk/`
