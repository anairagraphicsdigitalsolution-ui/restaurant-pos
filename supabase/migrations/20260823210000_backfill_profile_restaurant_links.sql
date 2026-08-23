-- Repair legacy restaurant users whose profile row predates the current
-- Super Admin user creation flow. The application already writes restaurant_id
-- into auth user metadata when it creates admin/staff accounts.
-- This only fills missing values; existing profile links are never overwritten.

UPDATE public.profiles p
SET restaurant_id = NULLIF(u.raw_user_meta_data->>'restaurant_id', '')::uuid
FROM auth.users u
WHERE p.id = u.id
  AND p.restaurant_id IS NULL
  AND NULLIF(u.raw_user_meta_data->>'restaurant_id', '') IS NOT NULL
  AND NULLIF(u.raw_user_meta_data->>'restaurant_id', '') <> '';

-- Keep the index available for the restaurant-scoped profile lookups used by
-- KDS, Billing, Orders and other protected restaurant pages.
CREATE INDEX IF NOT EXISTS idx_profiles_restaurant_id
  ON public.profiles (restaurant_id);
