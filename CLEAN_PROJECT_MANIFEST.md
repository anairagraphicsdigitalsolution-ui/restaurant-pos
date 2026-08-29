# Anaira POS Clean Project Manifest

This package is a cleaned source project, not a precompiled APK/EXE.

## Included
- Next.js web application
- Existing Super Admin / Restaurant Admin / Staff architecture
- Existing plugin architecture and switches
- Supabase migrations
- Windows local Supabase/Docker/Inno Setup runtime
- Capacitor Android project
- Android SQLite-backed `AnairaLocalDb` bridge
- Mobile local offline order store with IndexedDB fallback
- Mobile/cloud sync endpoint
- Offline pending invoice/KOT contract
- Cloud-side authoritative invoice/KOT allocator
- Service worker shell caching for previously visited web/app routes

## Offline billing contract
1. Device creates the permanent order UUID immediately.
2. Offline invoice display is `PENDING`.
3. Offline bill completion can be stored locally as `offline_bill_ready` with a unique payment UUID.
4. On connectivity, the restaurant-scoped sync endpoint reconciles the order/payment to Cloud.
5. Cloud records its receipt time and assigns invoice/KOT numbers exactly once.
6. The final Cloud values are returned to the device and retained in its local order snapshot.
7. Existing online billing remains unchanged; the offline allocator only acts on `sync_status = pending` orders.

## Android note
The Capacitor project currently points at the production web origin. Offline operation therefore requires the device to have opened/initialized the application online at least once so the service-worker shell and local data can be populated. The native SQLite bridge is included; a full offline-capable Android distribution still needs the normal Android build toolchain available on the build machine.

## Windows note
The Inno Setup installer remains the existing installer mechanism. It checks/installs Node.js LTS and Docker Desktop through winget, starts the local Supabase stack, and applies pending migrations without resetting an existing local database.

## Not included
- `.env.local` or other secrets
- `node_modules`, `.next`, Gradle build caches, generated installers/APKs
- old database dumps/backups and temporary files
