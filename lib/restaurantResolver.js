import { supabaseAdmin } from "@/lib/supabaseServer"

/** Resolve the tenant restaurant for an authenticated user.
 * Order of trust: profile link -> auth metadata -> restaurant owner_id.
 * Never returns a restaurant for super_admin unless explicitly supplied by caller.
 */
export async function resolveRestaurantForUser(user) {
  if (!user?.id) return { restaurantId: null, role: "", source: null }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("restaurant_id,role")
    .eq("id", user.id)
    .maybeSingle()

  const role = profile?.role || ""
  if (role === "super_admin") return { restaurantId: null, role, source: "super_admin" }

  if (profile?.restaurant_id) {
    return { restaurantId: profile.restaurant_id, role, source: "profile" }
  }

  const metadataRestaurantId = user.user_metadata?.restaurant_id || user.app_metadata?.restaurant_id || null
  if (metadataRestaurantId) {
    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("id", metadataRestaurantId)
      .maybeSingle()
    if (restaurant?.id) {
      return { restaurantId: restaurant.id, role: role || "admin", source: "metadata" }
    }
  }

  const { data: ownedRestaurant } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (ownedRestaurant?.id) {
    return { restaurantId: ownedRestaurant.id, role: role || "admin", source: "owner" }
  }

  return { restaurantId: null, role, source: null }
}
