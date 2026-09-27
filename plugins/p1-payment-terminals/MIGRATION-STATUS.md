# Migration status — P1 Payment Terminals

- Canonical boundary: `plugins/p1-payment-terminals/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p1-payment-terminals/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/payment-terminals/`
