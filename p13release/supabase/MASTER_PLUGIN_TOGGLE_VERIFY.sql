-- READ-ONLY verification for Restaurant Core / Operations Hub master switches.
-- This script changes NO data.

SELECT
  rp.restaurant_id,
  rp.plugin_code,
  rp.enabled,
  rp.activated_at,
  rp.disabled_at
FROM public.restaurant_plugins rp
WHERE rp.plugin_code IN ('restaurant-core','operations-hub')
ORDER BY rp.restaurant_id, rp.plugin_code;

-- Expected runtime behavior after migration:
-- is_restaurant_feature_enabled(...,'restaurant-core') follows the Core row.
-- is_restaurant_feature_enabled(...,'operations-hub') follows the Hub row.
-- Core child features follow Restaurant Core.
-- Expenses/Cash Closing follow Operations Hub + their existing child settings.
