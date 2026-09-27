# Migration status — Cashfree Payment Gateway

- Canonical boundary: `plugins/cashfree-payment-gateway/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/cashfree-payment-gateway/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/payment-gateway/`
- `app/api/payments/`
