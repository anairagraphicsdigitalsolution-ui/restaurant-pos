# Anaira POS — Static Security & Function Audit

Audited the supplied project source without a live production runtime.

## Fixed in this build
- Restaurant Admin `/dashboard/qr` now requires the independent `qr-print-center` plugin.
- Public QR ordering remains separately controlled by `qr-ordering-pro` / `qr-menu`; this change does not disable customer ordering.
- QR Print Center API now requires the print plugin for Restaurant Admins.
- Super Admin plugin catalog GET no longer performs one sequential database upsert per plugin. Catalog seeding is now one bulk upsert plus a bounded QR row self-heal.
- Admin Dashboard Add Table/Add Room now use authenticated server APIs rather than direct client inserts.
- Existing tenant/restaurant mapping logic and prior migrations are preserved.

## Static checks performed
- 85 app routes/pages discovered.
- 29 API routes discovered.
- Checked internal route references; only known anchors/legacy `/dashboard/crm` links were found as non-page references.
- Reviewed API authentication patterns; public QR order/feedback endpoints are intentionally unauthenticated and validate restaurant/source server-side.
- Reviewed QR plugin catalog, sidebar gating, access API and print-data API together.

## Not claimed
A full production click-through of all 85 pages, real Supabase RLS behavior, physical printers, Android hardware, and live payment providers cannot be verified from a ZIP alone. The local environment also did not have dependencies installed; `npm ci --ignore-scripts` timed out. Run `npm run build` locally before deployment.
