import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export async function requireLocalRestaurant(req, requestedRestaurantId = null) {
  const user = await requireApiUser(req)

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const linkedRestaurantId =
    profile?.restaurant_id ||
    user.user_metadata?.restaurant_id ||
    user.app_metadata?.restaurant_id ||
    null

  const requested =
    requestedRestaurantId ||
    linkedRestaurantId

  if (!requested) throw new Error("Restaurant not linked")

  if (
    profile?.role !== "super_admin" &&
    requested !== linkedRestaurantId
  ) {
    throw new Error("Restaurant access denied")
  }

  return {
    user,
    profile,
    restaurantId: requested,
  }
}
