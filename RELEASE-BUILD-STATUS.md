# Anaira Production Release Status

## Completed in this release candidate
- Fixed/verified social publish route target.
- Central server-side feature gating added for major optional/P1/P2 API modules through the shared authenticated API boundary.
- Restored root Android project and native offline bridge sources from the retained release source.
- Removed duplicate `p13release/` project snapshot from the production source tree.
- Restored the production view hardening migration for `restaurant_daily_payment_summary` using `security_invoker=true`.
- Removed `.env.local` from the release package.
- Static JavaScript syntax audit: PASS.
- Phase 1 reliability checks: PASS.
- Android offline readiness check: PASS.

## Environment-gated items
- `package-lock.json`: cannot be generated in this build environment because npm registry DNS/network access is unavailable. Do not fabricate a lockfile. Run `npm install` in a network-enabled release workstation and commit the generated lockfile.
- Next.js production build: cannot execute without installed dependencies.
- Android Gradle build: cannot execute because Gradle distribution download is blocked by external network/DNS in this environment.
- Electron installer build: requires installed npm dependencies and a Windows build environment.
- Physical printer/Bluetooth/payment-device E2E requires the actual hardware.

## Required final release sequence
1. `npm install --ignore-scripts --no-audit --no-fund`
2. Verify/commit `package-lock.json`.
3. `npm run phase1:check`
4. `npm run typecheck`
5. `npm run build`
6. `npm run electron:build` on Windows.
7. `android\\gradlew.bat -p android assembleDebug` with Android SDK/Gradle access.
8. Execute P0 payment/idempotency/reconciliation/sync E2E against a dedicated test restaurant.
9. Execute P1/P2 regression suite.
10. Physical printer, Bluetooth, terminal, kiosk, customer display and offline restart tests.
11. Only then mark the build Production Certified.
