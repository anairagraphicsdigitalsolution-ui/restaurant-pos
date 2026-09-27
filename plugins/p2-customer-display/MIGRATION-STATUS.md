# Migration status — P2 Customer Display

- Canonical boundary: `plugins/p2-customer-display/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p2-customer-display/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/customer-display/`
- `app/dashboard/customer-display-control/`
- `app/api/customer-display/`
