# Anaira Runtime/Auth/Supabase Safe Patch — 2026-09-24

## Scope
Fix the runtime errors shown in the supplied screenshots without changing the POS flow, Restaurant Core behavior, or Supabase schema/data.

## Verified live Supabase project
- Project: Anaira Graphics Saas
- Project ref: `vgzwzvmuylsoqjkqfcnw`
- Region: `ap-southeast-1`
- Status: `ACTIVE_HEALTHY`
- Database: PostgreSQL 17.6.1.084
- Read-only sanity check: 4 restaurants, 5 profiles, 140 orders.

## Root cause addressed
The browser application had two independent Cloud Supabase client instances:
- `lib/supabase.js`
- `lib/supabaseCloud.js`

AuthProvider used the first while several dashboard pages used the second. This can create duplicated persisted-session/auth bootstrap work and makes tenant resolution race-prone. Admin and Inventory also performed their own `profiles -> restaurants` tenant lookup even though AuthProvider already resolves `restaurantId`.

## Safe fixes
1. `lib/supabaseCloud.js` now re-exports the canonical Cloud client from `lib/supabase.js`.
2. `app/admin/page.tsx` reuses `AuthProvider.restaurantId` first; legacy profile/metadata/owner lookup remains only as fallback.
3. `app/dashboard/inventory/page.js` uses the same canonical AuthProvider tenant context; legacy fallback remains.
4. `app/dashboard/business/page.js` uses the canonical browser client and now reports HTTP/API errors with message/status instead of an opaque `{}`.
5. `app/api/restaurant-operations/route.js` reuses `requireApiUser`'s already-resolved `restaurant_id` before falling back to the legacy resolver.
6. `lib/serverAuth.js` now logs and returns the actual Supabase profile lookup error instead of collapsing it into `Application profile not found`.
7. Plugin implementation snapshots for Business Operations, Inventory, and Restaurant Operations API were synchronized with the safe runtime patch.

## Preserved behavior
- Existing POS order -> KOT -> KDS -> bill -> payment -> receipt/cashier flow untouched.
- Existing Restaurant Core runtime untouched.
- Existing Operations Hub refresh cadence/stale-response protection retained.
- No plugin enable/disable semantics changed.
- No route was removed.
- No Supabase migration was applied.
- No Supabase table/column/RPC/function/data/RLS policy was deleted or modified.

## Supabase read-only audit observations
Supabase is connected and healthy. Existing advisor warnings remain in the live project, including SECURITY DEFINER execute grants and duplicate indexes. They were deliberately NOT changed in this patch because the project baseline requires non-destructive Supabase changes only and several functions are part of existing application behavior.

## Validation performed
- Project connection/status verified through Supabase Management API.
- Relevant `profiles` and `restaurants` RLS policies inspected read-only.
- `current_restaurant_id()`, `current_user_role()`, and `is_super_admin()` definitions inspected read-only.
- Source-level syntax/flow inspection completed for all patched files.
- Supabase directory was not modified by this patch.

## Next recommended phase
Run the app with the real `.env.local` and authenticated account, then verify:
1. `/admin`
2. `/dashboard/business`
3. `/dashboard/inventory`
4. `/order`
5. `/kitchen`
6. `/billing`
7. thermal printing/Bluetooth
8. plugin enable/disable and Operation Hub integration gates.
