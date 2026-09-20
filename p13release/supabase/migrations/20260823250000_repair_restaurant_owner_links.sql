-- Repair legacy restaurant ownership links.
-- The authenticated tenant link is profiles.restaurant_id. Older restaurants
-- may have owner_id NULL, which breaks admin-side owner_id lookups and the
-- restaurants update RLS policy. Backfill only missing owner_id values from
-- an existing restaurant-admin/owner profile; never overwrite a non-null owner.

WITH candidates AS (
  SELECT DISTINCT ON (p.restaurant_id)
    p.restaurant_id,
    p.id AS owner_id
  FROM public.profiles AS p
  WHERE p.restaurant_id IS NOT NULL
    AND p.role IN ('admin', 'owner', 'restaurant_admin')
  ORDER BY p.restaurant_id, p.id
)
UPDATE public.restaurants AS r
SET owner_id = c.owner_id
FROM candidates AS c
WHERE r.id = c.restaurant_id
  AND r.owner_id IS NULL;

-- Keep the tenant resolver authoritative on profiles.restaurant_id.
-- No existing restaurant/profile links are changed by this migration.
