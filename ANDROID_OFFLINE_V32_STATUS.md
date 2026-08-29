# Android Offline V32 Status

This build adds persistent offline identity/profile recovery and a visible `Continue Offline` path after the device has previously completed an online login.

## Verified in source
- Cached user and session metadata are stored after successful sign-in.
- Offline startup restores the cached identity/profile without requiring a network auth request.
- Offline auth failures do not sign the locally cached identity out.
- Staff permissions/plugin checks are skipped offline so cached role access is preserved.
- Service worker navigation preload and cached document fallback are enabled.

## Important build boundary
The current Capacitor config still contains the production `server.url` (`https://www.anairapos.in`). This means this V32 source is **not** a proof of fully network-independent first boot. A true zero-network APK requires a verified bundled/static web runtime (or another native local server architecture) and full offline coverage of every server/API-dependent screen.

Do not describe the APK as 100% offline until that physical Airplane Mode end-to-end test passes.
