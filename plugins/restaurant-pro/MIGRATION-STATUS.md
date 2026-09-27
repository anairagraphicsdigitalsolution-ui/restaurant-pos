# Migration status — Restaurant Pro

- Canonical boundary: `plugins/restaurant-pro/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/restaurant-pro/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/restaurant-pro/`
- `app/api/enterprise/`
- `app/dashboard/accounting/`
- `app/dashboard/payroll/`
- `app/dashboard/enterprise/`
- `app/dashboard/payment-reconciliation/`
- `app/api/accounting/`
- `app/api/payroll/`
