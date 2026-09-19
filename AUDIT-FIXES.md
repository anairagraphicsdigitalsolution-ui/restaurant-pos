# Anaira SaaS — Full Audit Fixes

## 2026-09-19 full-app follow-up
- Added a short server-side cache to feature/plugin gates (`3s`) to reduce repeated `restaurant_plugins` lookups during one active request/navigation burst.
- Added invalidation for the plugin-manager cache after plugin installation/update.
- Preserved plugin activation semantics; cache is intentionally short-lived so Super Admin changes propagate quickly.
- Hardened public QR Pay mobile layout for small screens and iOS safe-area spacing.
- Kept the customer payment-claim flow non-settling: “I Have Paid” remains a notification/claim for restaurant verification.
- Kept automatic/Cashfree gateway routes untouched.
- Kept QR camera HTTPS/localhost requirement and manual UPI-value fallback.
- No business tables, orders, menu items, payment records, plugin data, or Supabase migrations were deleted or modified by this source audit package.

## Validation
- Source ZIP integrity verified before extraction.
- `next.config.js` was checked and contains a single standalone configuration.
- Existing NotificationProvider `restaurantId` narrowing fix is present.
- Build could not be executed in this environment because the ZIP has no `node_modules` and dependency installation timed out twice; therefore this package is source-audited but not presented as a completed production build.

## 2026-09-19 ORDER PAGE MOBILE NAVIGATION FIX
- Fixed the `/order` hamburger navigation button for Android WebView and mobile browsers.
- Added explicit pointer/touch handling (`onPointerDown`, `onTouchStart`, `onClick`) with a 48px mobile hit target.
- Raised the POS topbar and navigation drawer stacking levels to avoid mobile overlay/stacking interception.
- Made the drawer layer full viewport (`100vw`/`100dvh`) and explicitly interactive.
- Made the drawer sidebar explicitly `pointerEvents: auto` and touch-scrollable.
- Preserved existing Sidebar routes, role gating, plugin gating, and navigation callbacks.
- No Supabase tables/data/orders/menu/payment records were modified.
