# Anaira POS — Build & Performance Audit Fixes

## Applied
- Replaced fragile `eslint-config-next/core-web-vitals` loading with a stable ESLint 9 flat-config baseline.
- Changed `npm run lint` from deprecated `next lint` to `eslint .`.
- Kept `lucide-react` as an explicit runtime dependency; source code must install dependencies before build.
- Removed generated `.next`, `out`, and `build` artifacts from the delivery package.

## Verified statically in this source package
- No duplicate migration numeric prefixes found in the audited source.
- No missing relative source imports found in the audited source.
- Kitchen API uses parallel Supabase reads and limits live/history order counts.
- Kitchen, Order and Delivery screens have bounded fallback refresh intervals and realtime/visibility refresh paths.

## Important source consistency note
The local build log supplied by the user references `components/layout/Header.tsx`, but that file is not present in this exact source archive. Therefore this archive cannot truthfully claim to contain or fix that local Header.tsx error. Install dependencies in the exact project folder being built, or supply that exact current project archive for a source-identical build.


## 2026-09-17 — Supabase query/error cleanup pass

This pass preserves all application data, plugin rows, business records, and existing
working schema. No business table was dropped and no application data was deleted.

### Client fixes
- `components/ThemeProvider.tsx`
  - Platform theme loading is treated as optional configuration.
  - A transient/RLS/network read failure no longer uses `console.error`, which was
    triggering the Next.js development error overlay with `PLATFORM THEME LOAD ERROR: {}`.
  - Theme loading exceptions now fall back to the canonical `logo-premium` theme.
- `components/Sidebar.tsx`
  - Added a 15-second tenant-scoped in-memory navigation cache.
  - Repeated route remounts no longer repeat identical restaurant/plugin/settings/plan
    Supabase reads during the cache window.
  - `anaira:plugins-updated` explicitly bypasses the cache so plugin activation changes
    become visible immediately.
- `components/NotificationProvider.tsx`
  - Notification bootstrap now selects only required columns instead of `*`.
  - Added a 10-second bootstrap cache while retaining realtime INSERT subscriptions.
- `components/OrderNotificationListener.tsx`
  - Removed a dependency loop where `smartEnabled`/`smartSettings` changes caused the
    Supabase plugin/settings queries to run again.
  - Runtime notification configuration is held in refs so the listener stays current
    without re-running its database bootstrap effect.

### Live Supabase checks
- `public.platform_settings` exists and contains the `theme` row.
- Super Admin RLS simulation can read `platform_settings`; the current `is_super_admin()`
  policy path is functional.
- Existing indexes for `restaurant_plugins`, `plugin_settings`, `notifications`,
  `profiles`, `orders`, and `restaurant_subscriptions` were verified.
- Planner statistics were refreshed with `ANALYZE` for the main high-frequency tables.
- `get_restaurant_plan()` was rechecked after ANALYZE and the fresh execution observed
  was ~24 ms for two restaurants; the previous accumulated pg_stat_statements entry
  (7 calls, ~864 ms mean) was stale historical data, not evidence of the current runtime.

## 2026-09-18 BUILD/QUERY ERROR FOLLOW-UP

Source: user runtime/build log (`Pasted text(20260918-051103).txt`).

### Confirmed build blocker fixed
- `components/NotificationProvider.tsx`: `restaurantId` was narrowed in the outer effect but TypeScript does not preserve that narrowing inside the nested async `bootstrap()` closure. The bootstrap cache lookup/set now uses a local non-null `rid` after the guard.

### Confirmed runtime behavior corrected
- `app/api/dashboard/overview/route.js`: database/network timeout errors were previously returned as HTTP 401 because the catch block mapped every exception to 401. This has been corrected so authentication failures remain 401, timeout/fetch failures return 503, and other server failures return 500.
- `app/dashboard/page.js`: deterministic 401/403 responses are no longer retried three times. This prevents expired-session/auth failures from generating unnecessary repeated Supabase traffic. Transient failures can still retry.

### Database observations from connected Supabase project
- Dashboard top-items RPC was observed at about 63.5 ms average in the current `pg_stat_statements` sample.
- `pgbouncer.get_auth` was the slowest auth-related sample (15 calls, ~569 ms mean), so repeated authentication requests are materially more expensive than the dashboard top-items RPC.
- No business data or tables were deleted by this follow-up.

### Non-blocking build warnings
The supplied build log contains many `@next/next/no-img-element` and `@next/next/no-html-link-for-pages` warnings plus several unused-variable warnings. These do not cause the reported build failure. They were not mass-rewritten in this Supabase cleanup because doing so would create broad unrelated UI changes.


## 2026-09-18 THEME PROVIDER / SIDEBAR BUILD CLEANUP
- Fixed the blocking TypeScript error in `components/ThemeProvider.tsx`: Supabase `PostgrestError` does not expose a typed `status` property, so the unsupported `error?.status` access was removed from the warning payload.
- Cleaned non-blocking unused-variable warnings in `components/Sidebar.tsx` without changing navigation behavior: unused state values/setters are no longer destructured, and the unused `live` calculation was removed.
- Existing `<img>` lint warnings were intentionally left unchanged because they are warnings, not build blockers, and changing image rendering can affect existing layout/remote-image behavior.
