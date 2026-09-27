# Anaira POS — Phase 1 Reliability Implementation
Date: 2026-09-19

## Base
This package is based on the user-provided `Anaira-SaaS-v59-ORDER-PAGE-MOBILE-TABLET-NAV-DASHBOARD-BACK-FIXED-2026-09-19` ZIP.

## Scope
Phase 1 focuses on reliability before adding new business modules:
- mobile/tablet/desktop navigation
- Android WebView system-bar compatibility
- POS back navigation
- authentication/runtime continuity
- QR ordering/payment path preservation
- thermal/native printing path preservation
- Electron runtime preservation
- Supabase-connected runtime preservation

## Changes in this package
1. Order POS navigation no longer uses a time-based event lock or pointer-up handler. The menu uses a normal click activation, which is deterministic for mouse, touch, Android WebView and keyboard activation.
2. Order POS back action uses `router.replace("/dashboard")` so the operator returns to the dashboard rather than depending on browser history.
3. The POS navigation drawer passes an admin role fallback while auth state is still resolving, preventing a blank drawer during the first render.
4. Drawer shell/background/pointer/touch/stacking rules were hardened so the actual Sidebar is above the backdrop and remains interactive on phone and tablet.
5. Sidebar route effects no longer collapse a drawer-owned Sidebar through its internal mobile state.
6. Added `npm run phase1:check` for static regression checks of the core Phase 1 paths.

## Preserved
No Supabase schema/data migration was added by this package. Existing orders, menu items, tables, rooms, payments, plugins, QR configuration, auth and printing code are preserved.

## Verification
- ZIP source inspected from the user-provided base.
- JavaScript/TypeScript source changes are syntactically structured.
- Static Phase 1 verification script included.
- Full production build/device testing requires the project's dependencies and physical Android/iOS/tablet/browser environments; this package does not claim those external device tests were executed.
