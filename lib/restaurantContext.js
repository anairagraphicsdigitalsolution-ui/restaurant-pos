import "server-only"
import { resolveRestaurantForUser as _resolveRestaurantForUser } from "@/lib/restaurantResolver"
export async function resolveRestaurantForUser(user) {
  const r = await _resolveRestaurantForUser(user)
  return r?.restaurantId || null
}
