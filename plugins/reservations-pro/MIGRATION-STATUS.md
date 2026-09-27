# Migration status — Advanced Reservations

- Canonical boundary: `plugins/reservations-pro/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/reservations-pro/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/reservations/`
- `app/api/reservations/`
