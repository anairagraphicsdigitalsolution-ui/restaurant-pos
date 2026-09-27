import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const restaurantId = new URL(req.url).searchParams.get("restaurant_id")?.trim()

    if (!restaurantId) {
      return Response.json({ success: false, error: "Restaurant is required" }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabaseCloudAdmin
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

    const { data: pluginRows, error: pluginError } = await supabaseCloudAdmin
      .from("restaurant_plugins")
      .select("plugin_code,enabled")
      .eq("restaurant_id", restaurantId)
      .in("plugin_code", ["qr-menu", "qr-ordering-pro", "qr-print-center"])

    if (pluginError) {
      return Response.json({ success: false, error: "Unable to verify QR plugin access" }, { status: 500 })
    }

    const pluginState = Object.fromEntries(
      (pluginRows || []).map(row => [row.plugin_code, row.enabled === true])
    )

    const orderingEnabled = pluginState["qr-ordering-pro"] === true || pluginState["qr-menu"] === true
    const printEnabled = pluginState["qr-print-center"] === true

    // Restaurant Admin's internal QR page is intentionally available only
    // when the independent QR Print Center plugin is enabled. The public
    // customer QR ordering runtime is controlled separately by qr-ordering-pro.
    if (!isSuperAdmin && !printEnabled) {
      return Response.json({ success: false, error: "QR Print Center is disabled for this restaurant" }, { status: 403 })
    }

    const [{ data: restaurant, error: restaurantError }, { data: tables }, { data: rooms }] = await Promise.all([
      supabaseCloudAdmin
        .from("restaurants")
        .select("id,name,slug,logo,address,phone,description,cuisine,status")
        .eq("id", restaurantId)
        .maybeSingle(),
      supabaseCloudAdmin
        .from("tables")
        .select("id,table_number,seats")
        .eq("restaurant_id", restaurantId)
        .order("table_number", { ascending: true }),
      supabaseCloudAdmin
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
      rooms: rooms || [],
      orderingEnabled,
      printEnabled
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
