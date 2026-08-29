# Anaira POS — Android Phases 1–11 integration

This source package is based on the user's refined Operation Hub / Data Fixed V5 build.

Included native pieces:
- AnairaLocalDbPlugin.kt — additive Android SQLite bridge used by the existing JS layer.
- AnairaSyncWorker.kt — WorkManager recovery hook.
- prepare-android-platform.ps1 — creates the Capacitor Android platform and syncs the web project.

The JavaScript layer continues to fall back to IndexedDB for web/PWA. The Android plugin uses the same `AnairaLocalDb` contract used by `lib/mobileLocalDb.js`.

The supplied V5 archive does not ship a generated `android/` Gradle project. Therefore this package does not claim a compiled/signed APK. Running the preparation script in a normal development environment will create the platform project; then the native sources can be placed under `android/app/src/main/java/in/anairapos/app/` and WorkManager added to the Gradle dependencies.

No existing Supabase rows, migration history, or application seed data are modified by this package.
