# Android Offline Readiness — V20

The Android app now has an offline boot/cache path and local-first core order persistence. The remote Capacitor URL is intentionally retained so the existing Next.js server/API application remains unchanged when online.

## What works offline after one online bootstrap
- Cached application navigation can boot through the service worker.
- Restaurant slug and core order/menu/table/room/modifier/zone snapshots can be read locally.
- Offline order creation is stored locally and queued for later sync.
- Local sync diagnostics/retry infrastructure remains available.

## What still requires connectivity
- First login/restaurant bootstrap.
- Any page or feature whose server/API data has never been cached locally.
- Server-side Next.js API routes cannot be executed inside a normal Capacitor WebView while offline.

A true 100% offline copy of every server/API-backed feature would require implementing those APIs against the native/local database or embedding a server runtime in the Android app. This package does not pretend that has been completed.
