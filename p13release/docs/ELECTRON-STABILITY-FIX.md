# Anaira POS Electron stability fixes

This release hardens the Windows Electron shell against intermittent freezes and false automatic sign-outs.

## Changes

- Auth startup now uses the persisted Supabase session instead of forcing a network `getUser()` check.
- Supabase/profile/plan/permission errors are treated as transient unless they clearly indicate an invalid auth session.
- A temporary Cloud/DB/network failure no longer calls `auth.signOut()`.
- `TOKEN_REFRESHED` no longer triggers a full auth/profile graph reload, reducing auth-lock contention.
- Realtime notifications and calling runtime reuse the central AuthProvider state instead of independently querying the auth session/profile at startup.
- Supabase browser HTTP requests have a 20-second timeout so a stalled request cannot remain pending forever.
- Electron prevents multiple app instances from competing for the embedded Next.js port.
- Electron logs renderer unresponsive/crash events and automatically attempts to restart an unexpectedly terminated embedded Next.js server up to three times.
- The Cloud-only cleanup no longer wipes the entire Cache Storage on every startup.

## Build

From the Windows project directory:

```powershell
npm install
npm run electron:build
```

If creating the installer:

```powershell
npm run electron:build
```

The uploaded source archive used for this patch does not contain the `installer/` directory, so the installer itself could not be compiled in this environment. The Electron/application source fixes are included.
