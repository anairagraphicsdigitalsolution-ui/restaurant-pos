import "server-only"
import { resolveRestaurantForUser as _resolveRestaurantForUser } from "@/lib/restaurantResolver"
export async function resolveRestaurantForUser(user) {
  const r = await _resolveRestaurantForUser(user)
  return r?.restaurantId || null
}
export async function requireRestaurantAccess(user, requestedRestaurantId = null) {
  const r = await _resolveRestaurantForUser(user)
  if (!r?.restaurantId) throw new Error("Restaurant profile not found")
  if (requestedRestaurantId && requestedRestaurantId !== r.restaurantId && String(user?.role || "").toLowerCase() !== "super_admin") throw new Error("Restaurant access denied")
  return r.restaurantId
}
