# Anaira POS — Phase 1 to Phase 11 consolidated package

Base: refined Operation Hub / Data Fixed V5 source supplied in this conversation.

Applied source layers:
1. Local DB foundation — versioned mobile store, additive upgrades, restaurant scoping.
2. Local-first persistence — durable records and sync queue primitives.
3. Invoice/payment durability — local payment/bill state, official invoice authority remains server-side.
4. Bidirectional sync — mobile push + cloud pull endpoint.
5. Conflict protection — stale Cloud events do not overwrite newer local records; conflict records are retained.
6. Stable device identity for multi-device operation.
7. Resume/reconnect/service-worker sync triggers.
8. Android native SQLite bridge + WorkManager recovery hook.
9. Retry/backoff and single-flight sync hardening.
10. Android release preparation and verification tooling.
11. Sync diagnostics/health metadata and operator recovery events.

Data safety: this package does not alter Supabase data, existing migration files, or application seed data. No destructive DB operation is included.

Boundary: the base source does not contain a generated Capacitor `android/` Gradle platform; native source and preparation tooling are included, but no signed APK or physical-device acceptance test is claimed.
