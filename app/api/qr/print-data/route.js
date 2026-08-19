import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const restaurantId = new URL(req.url).searchParams.get("restaurant_id")?.trim()

    if (!restaurantId) {
      return Response.json({ success: false, error: "Restaurant is required" }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,role,restaurant_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return Response.json({ success: false, error: "Profile not found" }, { status: 403 })
    }

    const isSuperAdmin = profile.role === "super_admin"
    const isAdmin = profile.role === "admin"

    if (!isSuperAdmin && !isAdmin) {
      return Response.json({ success: false, error: "QR Print Center is available to admins only" }, { status: 403 })
    }

    if (!isSuperAdmin && profile.restaurant_id !== restaurantId) {
      return Response.json({ success: false, error: "Restaurant access denied" }, { status: 403 })
    }

    if (!isSuperAdmin) {
      const { data: planEnabled, error: planError } = await supabaseAdmin.rpc("has_restaurant_plan_feature", {
        p_restaurant_id: restaurantId,
        p_plugin_code: "qr-menu"
      })

      if (planError) {
        return Response.json({ success: false, error: "Unable to verify QR Menu plan" }, { status: 500 })
      }

      if (planEnabled !== true) {
        return Response.json({ success: false, error: "QR Menu is not available on this restaurant plan" }, { status: 403 })
      }

      const { data: plugin } = await supabaseAdmin
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "qr-menu")
        .maybeSingle()

      if (!plugin?.enabled) {
        return Response.json({ success: false, error: "QR Menu plugin is disabled" }, { status: 403 })
      }
    }

    const [{ data: restaurant, error: restaurantError }, { data: tables }, { data: rooms }] = await Promise.all([
      supabaseAdmin
        .from("restaurants")
        .select("id,name,slug,logo,address,phone,description,cuisine,status")
        .eq("id", restaurantId)
        .maybeSingle(),
      supabaseAdmin
        .from("tables")
        .select("id,table_number,seats")
        .eq("restaurant_id", restaurantId)
        .order("table_number", { ascending: true }),
      supabaseAdmin
        .from("rooms")
        .select("id,room_number")
        .eq("restaurant_id", restaurantId)
        .order("room_number", { ascending: true })
    ])

    if (restaurantError || !restaurant) {
      return Response.json({ success: false, error: "Restaurant not found" }, { status: 404 })
    }

    if (!restaurant.slug) {
      return Response.json({
        success: false,
        error: "This restaurant does not have a public slug. Update the restaurant once from Super Admin and try again."
      }, { status: 409 })
    }

    return Response.json({
      success: true,
      restaurant,
      tables: tables || [],
      rooms: rooms || []
    }, {
      headers: {
        "Cache-Control": "private, max-age=0, no-store"
      }
    })
  } catch (error) {
    console.error("QR PRINT DATA ERROR:", error)
    return Response.json({ success: false, error: error?.message || "Unable to load QR data" }, { status: 401 })
  }
}
