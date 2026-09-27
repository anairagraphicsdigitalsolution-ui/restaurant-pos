# Manual Payment + Calling Device Final Fix

## Super Admin
- `Plugins → Merchant Payments & Voice` is now a real installable plugin in the runtime catalog.
- Its settings load/save through `/api/super-admin/payment-account`, so the plugin UI edits the same `restaurant_payment_accounts` record used by Restaurant Admin and Pay Bill.
- Manual QR upload uses `/api/payment-qr/upload` and previews the uploaded QR before saving.

## Calling Device
- Restaurant notifications are now consumed from Supabase Realtime `postgres_changes` INSERT events on `public.notifications`; the old broadcast event remains supported.
- The Android app now also exposes `window.Android` through `AnairaWebBridge` in the actual `in.anairapos.app` package. Capacitor Text-to-Speech remains the primary native TTS path.
- Android 13+ notification permission is declared.

## Supabase
- Latest idempotent migration: `20260917170000_ensure_manual_payment_plugin_and_notifications.sql`.
- Apply migrations before testing the Super Admin plugin toggle on a production database.
