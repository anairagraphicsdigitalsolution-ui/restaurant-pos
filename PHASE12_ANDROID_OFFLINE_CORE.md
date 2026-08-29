# Phase 12 — Android Offline Core

This phase makes the Android runtime more resilient when the network is unavailable after the device has been provisioned online.

## Included
- Android offline API bridge for core POS mutations/reads.
- Offline order creation, kitchen status changes, delivery create/settle/done, billing list/finalize.
- Android/offline local Supabase-style read adapter for cached relational rows.
- Online core-data bootstrap into the mobile local DB.
- Offline auth/profile bootstrap from the locally persisted authenticated session/profile metadata.
- Service-worker navigation/static asset caching and offline fallback.
- Existing Local → Cloud / Cloud → Local sync architecture remains intact.

## Operational boundary
A fresh installation still requires one online authenticated session to provision the restaurant/menu/session snapshot. This package does not claim first-ever zero-network bootstrap or a completely server-independent copy of every admin/AI/integration endpoint.
