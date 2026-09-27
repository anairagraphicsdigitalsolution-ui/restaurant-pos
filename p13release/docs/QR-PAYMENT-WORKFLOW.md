# Anaira QR Ordering + Payment Workflow

## Customer flow

Scan QR → secure guest session → browse menu → order → live status → add more/reorder → request waiter/bill → pay.

## Automatic payment

Automatic payment is shown only when the restaurant has the Merchant Payments & Voice account active, `auto_payment_detection` enabled, and the Cashfree payment gateway plugin configured. Cashfree verifies the payment by webhook. A fully paid order can then be auto-finalized/invoiced by the server.

## Manual QR payment

Admin can upload a QR image from any supported UPI/payment provider or configure a merchant UPI ID. The customer receives the QR, pays externally, then taps **I Have Paid** and may enter a UTR/reference. This creates a customer-claimed payment request and a real-time restaurant notification. Staff verifies the payment and uses **Verify & Settle** in Billing.

A customer claim is never treated as proof of payment by itself.

## Direct billing

A customer can use **Request Bill**. The restaurant receives a notification with an action link to Billing, where the order can be opened directly and finalized manually.

## Data safety

Guest tracking uses a hashed session token. Provider secrets are never sent to the public QR browser. Payment totals remain server-authoritative. Duplicate QR order retries use an idempotency key.
