import "server-only"
import { requireApiUser as _requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser as _resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { requireStaffPermission as _requireStaffPermission } from "@/lib/serverStaffPermissions"

export async function requireApiUser(req) { return _requireApiUser(req) }
export async function resolveRestaurantForUser(user) {
  const r = await _resolveRestaurantForUser(user)
  return r?.restaurantId || null
}
export async function requireStaffPermission(user, restaurantIdOrPermission, permissionMaybe) {
  if (permissionMaybe === undefined) {
    const r = await _resolveRestaurantForUser(user)
    if (!r?.restaurantId) throw new Error("Restaurant profile not found")
    return _requireStaffPermission(user, r.restaurantId, restaurantIdOrPermission)
  }
  return _requireStaffPermission(user, restaurantIdOrPermission, permissionMaybe)
}
