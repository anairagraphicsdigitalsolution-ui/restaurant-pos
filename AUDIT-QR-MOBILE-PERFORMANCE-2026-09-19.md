# Anaira POS — QR + Mobile Performance Audit
Date: 2026-09-19

## Scope
Audited the uploaded production ZIP, with emphasis on:
- public QR ordering flow
- QR context/session/status APIs
- order creation latency
- Supabase query patterns
- responsive/mobile/iOS layout safety
- existing build/runtime safety

## Findings

### QR initial load
`app/api/public/qr-context/route.js` previously made separate PostgREST requests for each plugin and setting even though all state belonged to the same restaurant. The route also made a second restaurant query only to read `theme_config`.

### QR order submission
`app/api/orders/create/route.js` created the order through the authoritative RPC, then synchronously performed the cloud print queue workflow. `lib/orderSlipPrinter.js` performs multiple reads before inserting the print job. That work could delay the customer's success response.

Supabase statistics on 2026-09-19 showed:
- `create_public_qr_order`: 3 calls, mean ~351 ms.
- QR guest-session insert: 3 calls, mean ~90.6 ms.
- QR guest-session token lookup: 3 calls, mean ~0.58 ms.
- QR guest-session last-seen update: 2 calls, mean ~11.2 ms.
- Repeated single-plugin checks accumulated thousands of calls (for example, one `restaurant_plugins` query shape had 5,239 calls at ~2.82 ms mean).

The dominant user-visible issue is therefore not a single catastrophic SQL query; it is cumulative network/PostgREST round trips plus synchronous post-order work.

## Fixes applied

1. QR context route:
   - Added 30-second framework revalidation for public QR context.
   - Batched QR/theme/operations/offers plugin reads into one query.
   - Batched theme/offers plugin settings into one query.
   - Removed the duplicate `restaurants.theme_config` round trip and uses the already loaded restaurant row.
   - Preserved existing plugin gating and offer/theme behavior.

2. QR order response:
   - Cloud KOT/thermal print job generation is now scheduled with Next.js `after()` so the successful order response is not blocked by print-job reads/insertion.
   - Printing remains durable and server-side; no local printer access was moved into the browser.
   - Existing order RPC/idempotency/session behavior is preserved.

3. iPhone/mobile:
   - QR floating cart now accounts for `safe-area-inset-bottom`.
   - QR bottom drawer includes safe-area padding.
   - QR form controls use 16px on mobile to prevent iOS Safari input zoom.
   - Public QR menu uses 2 columns on <=420px screens and 3 columns from 421–520px, improving readability on iPhone 11/12/13/14/15/16 class widths.
   - Existing tablet/desktop breakpoints remain.

## Supabase live status
Project `vgzwzvmuylsoqjkqfcnw` is currently reported by Supabase as `ACTIVE_HEALTHY`.

Current advisor findings:
- Performance: 380 unused-index INFO findings; 116 multiple-permissive-policy WARN findings.
- Security: 4 public SECURITY DEFINER execution warnings, 16 authenticated SECURITY DEFINER execution warnings, and leaked-password protection disabled.

Unused-index findings were not bulk-deleted. Multiple-policy and SECURITY DEFINER findings were not blindly rewritten because they require policy/function-by-function authorization review.

## Validation
- ZIP integrity: passed.
- Node syntax check passed for changed JS route files.
- No business tables/data were deleted or modified by this audit.
- Existing application features were preserved.
