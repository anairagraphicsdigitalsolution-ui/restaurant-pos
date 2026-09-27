# Migration status — Merchant Payments & Voice

- Canonical boundary: `plugins/payment-accounts/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/payment-accounts/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/payment-qr/`
- `app/api/payment-qr/`
