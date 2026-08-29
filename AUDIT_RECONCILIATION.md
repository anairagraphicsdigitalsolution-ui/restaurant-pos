# V32 Android Offline Reconciliation

Base: Anaira POS V31.

Changes applied:
- Persistent cached auth user/session metadata after successful sign-in.
- Offline startup restores the last successful local identity/profile before any cloud auth request.
- Offline startup no longer signs out a cached identity because the network is unavailable.
- Cached role/restaurant access remains usable offline; staff/plugin cloud checks are skipped offline.
- Login page adds `Continue Offline` when the device is offline and a cached identity/profile exists.
- Service worker navigation preload and cached-document fallback are retained/enhanced.

Known limitation:
- The current Capacitor configuration still uses the production `server.url` for the online web runtime.
- Therefore this is an offline-session recovery improvement, not a proof of zero-network first boot.
- Full 100% offline parity still requires the app UI and every server/API-dependent operation to be packaged and executed locally on Android, followed by physical Airplane Mode E2E validation.
