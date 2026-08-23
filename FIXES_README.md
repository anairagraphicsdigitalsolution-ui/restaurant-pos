ANAIRA POS - PAYMENT / BILLING CONSISTENCY FIXES

This build keeps Razorpay disabled. It does NOT claim automatic bank/UPI transaction detection.

Included fixes:
1. Payment ledger is the source of truth for collected money.
2. order_payments and order_refunds synchronize orders.paid_amount/payment_status.
3. Billing Paid Orders, Collected and Pending use the payment ledger.
4. Payment-method totals are shown in Billing.
5. Billing finalize records the payment atomically in order_payments.
6. Partial payments accumulate correctly; the next Bill screen defaults to outstanding amount.
7. UTR / transaction reference can be entered and is printed in the payment receipt section.
8. Refunds reduce net collected amount and resync order payment status.
9. Cash Closing uses cash payments from order_payments instead of order totals.
10. Payment/refund RLS policies are added and order_payments.created_at is ensured.
11. Existing legacy orders with paid_amount are backfilled into the payment ledger.
12. Billing continues using the authoritative database offer engine for preview/finalization.
13. Fake Razorpay success behavior is disabled until a real provider integration is configured.

Required after replacing the project:
  npm install
  npm run build
  npx supabase db push
  git add .
  git commit -m "Fix payment ledger billing offers and cash reconciliation"
  git push origin main

Razorpay / external UPI webhooks are intentionally not active in this build. A real PSP/acquirer integration is required before external GPay/PhonePe/Paytm payments can automatically arrive in Anaira.
