# Anaira SaaS v59 — QR Android/WebView UUID Fix

## Issue fixed
QR customer Place Order could fail in Android/mobile browser with:

`crypto.randomUUID is not a function`

Some Android WebViews/browsers expose `crypto` but do not implement `crypto.randomUUID()`.

## Fix
Added `lib/clientUuid.js` with a browser/WebView-safe UUID generator:
1. Uses `crypto.randomUUID()` when available.
2. Uses `crypto.getRandomValues()` when `randomUUID()` is unavailable.
3. Uses a timestamp/random fallback only when Web Crypto is unavailable.

Client-side request/session/id generation was switched to this helper where direct `crypto.randomUUID()` could execute in the browser.

## QR flow preserved
No QR plugin architecture was removed or bypassed. The existing QR session, order, KOT, tracking and payment flow remains intact.

## Validation
- JavaScript syntax check: PASS (0 errors).
- No environment files included.
- Server-side `crypto.randomUUID()` usages remain untouched where Node/Web Crypto is appropriate.
- Production `npm run build` was not claimed as verified because dependency installation/network/cache is not available in this sandbox.
