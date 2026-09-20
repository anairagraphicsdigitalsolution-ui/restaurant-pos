# Anaira SaaS v59 — Build & QR Tracking Fixes

## Build errors addressed

1. `eslint-config-next/core-web-vitals` import in `eslint.config.mjs` now uses the explicit `.js` entrypoint required by Node ESM resolution in this setup.
2. `lucide-react` is now declared as an application dependency so local `Header.tsx` imports such as `Menu`, `Search`, `Bell`, `UserCircle`, `X`, and `Loader2` can resolve after `npm install`.

## QR tracking behavior

- A QR session token is retained in browser localStorage for the table/room context.
- The latest QR order ID is also retained in localStorage.
- Refreshing or returning to the same QR menu can automatically resume the latest order tracking without scanning again.
- After an order is placed, the URL is converted to a shareable tracking URL with the order ID in the query string and the bearer session token in the URL fragment (`#track=...`). The fragment is not sent as a normal HTTP request parameter.
- The QR page polls the existing `/api/public/qr-status` endpoint for live status/payment changes.
- The tracking panel provides Copy Tracking Link and Share Tracking controls.
- Payment return URLs continue to recover the order through the stored session/order context.

## Validation performed

- All `.js`, `.mjs`, and `.cjs` source files: Node syntax check PASS (234 files).
- Duplicate Supabase migration version audit: PASS (no duplicate version prefixes).
- JSON syntax for `package.json`: PASS.
- Full `next build` was not executed in this container because dependency installation timed out; the source archive therefore should be validated with `npm install` followed by `npm run build` in the user's project environment.
