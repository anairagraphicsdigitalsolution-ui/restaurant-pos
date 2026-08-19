import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, restaurant_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return Response.json({ success: false, error: "Profile not found" }, { status: 403 })
    }

    if (!["admin", "super_admin"].includes(profile.role)) {
      return Response.json({ success: false, error: "Not authorized" }, { status: 403 })
    }

    const requestedRestaurantId = String(
      new URL(req.url).searchParams.get("restaurant_id") || ""
    ).trim()

    const restaurantId =
      profile.role === "super_admin"
        ? requestedRestaurantId
        : profile.restaurant_id

    if (!restaurantId) {
      return Response.json(
        { success: false, error: "restaurant_id is required" },
        { status: 400 }
      )
    }

    if (profile.role !== "super_admin" && restaurantId !== profile.restaurant_id) {
      return Response.json({ success: false, error: "Not authorized" }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from("plugins")
      .select("*")
      .eq("restaurant_id", restaurantId)

    if (error) {
      console.error("PLUGIN LIST ERROR:", error)
      return Response.json(
        { success: false, error: "Unable to load plugins" },
        { status: 500 }
      )
    }

    return Response.json({ success: true, data })
  } catch (error) {
    console.error("PLUGIN LIST AUTH ERROR:", error)
    return Response.json(
      { success: false, error: error?.message || "Authentication required" },
      { status: 401 }
    )
  }
}
