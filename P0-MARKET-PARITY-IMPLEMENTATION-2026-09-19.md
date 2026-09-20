# Anaira P0 — Market Parity & Core Reliability

Base: Phase 7 Operations Control A–Z fixed ZIP, 2026-09-19.

## Implemented

1. Financial transaction guardrails
   - Exactly-once idempotency records for payment/refund/void operations.
   - Row locking on the order during payment/refund/void.
   - Payment cannot exceed outstanding balance.
   - Refund cannot exceed net refundable payment.
   - Paid/partially-paid orders cannot be voided.
   - Existing payment ledger remains the source of truth.

2. Sync/conflict foundation
   - Persistent cloud conflict table.
   - Mobile sync engine records cloud-vs-local conflicts instead of silently overwriting newer local data.
   - Billing-finalize queue items now retry through the authenticated billing API with an idempotency key.
   - Mobile sync runtime is active on Android when the app is running/online and on reconnect, with a 60-second foreground interval.

3. Reconciliation/accounting/aggregator foundations
   - Payment reconciliation staging table.
   - Accounting journal staging table for future Tally/Zoho/QuickBooks adapters.
   - Aggregator event ledger with provider/event deduplication.

4. API integration
   - Anaira Suite, Restaurant Operations and manual QR payment settlement use the P0 payment/refund/void transaction RPCs.

## Not falsely claimed as complete

- True Android background sync while the app process is fully terminated still requires a native authenticated worker/secure device session architecture.
- Swiggy/Zomato production credentials and provider-specific contracts are not fabricated; the existing adapter remains configuration-driven.
- Tally/Zoho/QuickBooks live APIs are not claimed connected; the accounting journal layer is the safe foundation.

## Data safety

Additive schema only. No restaurant/business rows were deleted.
