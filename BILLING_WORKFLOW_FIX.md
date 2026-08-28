# Billing workflow fix

Billing is now unlocked only when an order has status `done`.

Changes:
- Billing order query only loads `orders.status = done`.
- Billing has a client-side guard against stale/localStorage orders.
- Finalize Bill has a client-side DONE guard.
- `/api/billing/finalize` verifies the order is DONE before generating an invoice.
- Added Supabase migration `20260827190000_billing_requires_done_order.sql` as database-side defense-in-depth.

Existing order/kitchen/payment logic was otherwise left unchanged.

Validation performed:
- Compared modified files against the uploaded source; only the intended Billing/API changes plus the new migration were added.
- Node syntax check passed for the modified billing finalize API and kitchen status API.
- Migration audit passed with no duplicate migration versions.
- Full Next.js build could not be completed in this environment because the uploaded project had no complete `node_modules` and package installation could not finish due registry/network timeout. No claim of a full runtime build is being made.
