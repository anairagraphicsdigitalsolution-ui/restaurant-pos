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


## 2026-09-19 ORDER PAGE MOBILE/TABLET NAVIGATION REWORK
- Used ORDER-INFO-ROW-FIXED ZIP as the base as requested.
- Reworked Order Page navigation drawer to use a dedicated fixed shell and explicit pointer/touch handling.
- Added guarded pointer/click handling for the mobile/tablet menu trigger.
- Back button now explicitly routes to /dashboard instead of browser history.
- Added <=1100px and <=520px navigation/header rules for phone and tablet widths.
- Preserved existing Sidebar links, plugin gating, POS data, order flow, and Supabase logic.

## Phase 7 — Enterprise / Multi-Outlet
- Added non-destructive enterprise control-plane tables: groups, members, outlets, central menu, outlet pricing, inventory transfers, devices, audit logs.
- Added membership-protected enterprise summary RPC and server endpoint.
- Added Enterprise Control Center dashboard.
- Existing restaurant/order/menu/inventory/customer data is preserved; Phase 7 does not migrate or delete existing business rows.
