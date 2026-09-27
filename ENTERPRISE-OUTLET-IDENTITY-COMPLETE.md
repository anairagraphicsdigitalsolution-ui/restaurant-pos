# Anaira Enterprise HQ — Outlet Identity & Access Completion

## Implemented
- Main branch flag on enterprise_outlets.
- Outlet admin username stored as a login alias; password remains in Supabase Auth.
- Unique profiles.username with case-insensitive unique index.
- Canonical restaurants.code column added to remove the previous Enterprise HQ `restaurants.code does not exist` runtime error.
- New outlet provisioning creates a dedicated restaurant tenant and dedicated Supabase Auth admin account.
- New outlet provisioning copies operational setup from the current/main restaurant without copying live order/payment/customer balances.
- Outlet admin receives separate email + username + password credentials.
- Existing Restaurant connection remains supported.
- Existing enterprise owner is marked as the main branch owner in the live database.
- Username-or-email login is supported on the existing Anaira login page without changing Supabase Auth's underlying email/UUID identity model.
- HQ retains consolidated enterprise visibility through Enterprise membership; outlet admins remain restaurant-scoped.
- Central menu publishing continues to materialize normal menu_items in each outlet, preserving the existing POS/KOT/KDS/billing flow.

## Live baseline
- Enterprise: NH3 Enterprise
- Main branch: NH3 Restaurent / NH3-001
- Enterprise owner username: `nh3.owner`
- Owner email remains the existing Auth email; no password was changed.

## Security
- No passwords are stored in public tables.
- Outlet admin profiles are tied to a restaurant_id.
- Enterprise owner access is controlled by enterprise_members.role.
- Existing RLS and server-side authorization remain in place.
- Outlet creation is additive; existing orders and business records are not deleted.

## Verification
- Node syntax check passed for modified login, username resolver, Enterprise HQ page and Enterprise HQ API.
- Full Next.js production build was not run because this source copy does not contain node_modules.
