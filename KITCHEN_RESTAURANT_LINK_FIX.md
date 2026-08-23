# Kitchen restaurant-link fix

Fixed the KDS error `Restaurant not found for user`.

Changes:
- Kitchen page now resolves restaurant_id from the profile first, then auth user metadata for legacy accounts.
- `/api/kitchen/orders` uses the same fallback.
- Added a migration that backfills missing `profiles.restaurant_id` values from `auth.users.raw_user_meta_data.restaurant_id` without overwriting existing links.

After replacing the files:
1. `npm run build`
2. `npx supabase db push`
3. `git add .`
4. `git commit -m "Fix kitchen restaurant user mapping"`
5. `git push origin main`
