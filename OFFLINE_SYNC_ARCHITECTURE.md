# Anaira POS — Offline-first contract

## Device identity
Every order is identified by its UUID (`orders.id`). The UUID is created on the device immediately and never changes.

## Offline display
Offline-created orders use `invoice_no = PENDING` and `sync_status = pending`. The customer can receive a temporary order receipt without a final invoice number.

## Cloud finalization
When a pending offline order reaches Cloud, the server records `cloud_received_at` using the Cloud database clock and assigns the authoritative invoice and KOT numbers. Existing invoice/KOT numbers are never renumbered.

The authoritative fields are:
- `orders.id` — permanent Global Order ID
- `orders.created_at` / `offline_created_at` — original business time
- `orders.cloud_received_at` — Cloud receipt time
- `orders.invoice_generated_at` — invoice allocation time
- `orders.invoice_no` — final invoice number
- `orders.sync_status` — synchronization state
- `kot_tickets.kot_no` — final KOT number

## Android local storage
The Android build contains the `AnairaLocalDb` Capacitor plugin backed by Android SQLite. The JavaScript layer also has an IndexedDB fallback for web/PWA environments. The local mobile store is restaurant-scoped and is not a platform/Super Admin database.

## Important billing rule
The existing online billing finalize flow remains authoritative for normal online orders. The offline sync allocator only acts on orders explicitly marked `sync_status = pending`.

## Installer behavior
The Windows installer starts Docker/Supabase and applies only pending migrations with `supabase db push --local`; it does not reset an existing local database. Node.js LTS and Docker Desktop are installed through winget when missing.
