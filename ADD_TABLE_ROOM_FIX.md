# Add Table / Add Room / Add Menu Item Fix

- Add Table now resolves the logged-in restaurant and inserts `restaurant_id`.
- Add Table uses `table_number` (the actual DB column), not `name`.
- Add Room now resolves the logged-in restaurant and inserts `restaurant_id`.
- Add Menu Item now inserts `restaurant_id` and reuses existing restaurant categories from `menu_items`.
- New categories can be added to the selector before saving an item.
- No new Supabase migration is required for these code-only fixes.

Validation performed:
- Targeted TypeScript/JSX parse checks passed for the changed pages and `components/AuthProvider.tsx`.
- Static search confirmed all direct table/room inserts in the app include `restaurant_id`.
- Full Next.js build could not be executed in this environment because dependency installation (`npm ci`) timed out and left the local `next` binary unavailable. Run `npm run build` in the user's project before deployment.
