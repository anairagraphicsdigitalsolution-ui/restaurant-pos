# Anaira QR Order Stability Fix — 2026-09-16

## Root cause found by comparing the two supplied builds

The earlier Fast-POS build sent the order directly to `/api/orders/create`.

The newer QR/Android build added this prerequisite in the browser:

`await ensureQrSession()`

before calling `/api/orders/create`. That made QR session/database availability a hard dependency for the core order button. The newer build also added several post-order QR-session queries/updates.

As a result, if `qr_guest_sessions` or its schema/cache was unavailable, the customer could be prevented from reaching the actual order RPC even though the original order flow was healthy.

## Fix

- Core `create_public_qr_order` RPC remains the first authoritative database operation.
- QR guest session creation is now post-order and best-effort.
- If QR session storage is temporarily unavailable, the order still succeeds.
- Server returns `session_token` when the optional tracking session is created.
- Client adopts that token after successful order creation.
- Idempotency (`qr_client_request_id`) is persisted independently from QR tracking.
- Existing QR tracking/payment/service-request features are preserved when the session runtime is healthy.
- Existing menu, KOT, billing, WhatsApp, printing, plugins, offline, and POS features are preserved.
- JavaScript syntax verification completed with zero errors.

## Database note

This code does not silently replace or remove the QR migrations. The QR session/payment tables remain part of the project. The fix only prevents optional QR runtime failure from cancelling a core order.

A real Supabase outage/connection failure will still correctly cause the authoritative order RPC itself to fail; this patch specifically removes the unnecessary pre-order QR-session dependency.
