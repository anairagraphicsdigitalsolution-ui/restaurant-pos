# Phase 12 — Android Offline Boot Hardening

## Purpose
The refined Operation Hub/Data Fixed base remains the source of truth. This phase makes the Android WebView resilient when the network is unavailable after the device has been bootstrapped once online.

## Changes
- Service worker caches navigation documents and static Next assets and provides `/offline.html` fallback.
- Order page becomes explicitly offline-first when the device is already prepared and has local restaurant/menu/table/room/modifier/zone snapshots.
- Offline order creation continues through `mobileOffline`/local queue.
- No Supabase rows or application seed data are modified.

## Limitation
This does not magically convert server-side Next.js API routes into an Android-native offline server. First installation/login and initial restaurant bootstrap still require connectivity. Full offline parity for every server/API-backed page requires native local API implementations or a different packaging architecture.
