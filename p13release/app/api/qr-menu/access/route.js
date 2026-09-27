import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const restaurantId = new URL(req.url).searchParams.get("restaurant_id")

    if (!restaurantId) {
      return NextResponse.json({ success: false, error: "Restaurant is required" }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabaseCloudAdmin
      .from("profiles")
      .select("restaurant_id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) return NextResponse.json({ success: false, error: "Unable to verify restaurant" }, { status: 500 })

    const isSuperAdmin = profile?.role === "super_admin"
    if (!isSuperAdmin && profile?.restaurant_id !== restaurantId) {
      return NextResponse.json({ success: false, error: "Restaurant access denied" }, { status: 403 })
    }

    const { data: plugins, error: pluginError } = await supabaseCloudAdmin
      .from("restaurant_plugins")
      .select("plugin_code,enabled")
      .eq("restaurant_id", restaurantId)
      .in("plugin_code", ["qr-menu", "qr-ordering-pro", "qr-print-center"])

    if (pluginError) return NextResponse.json({ success: false, error: "Unable to verify QR plugin access" }, { status: 500 })

    const state = Object.fromEntries((plugins || []).map(row => [row.plugin_code, row.enabled === true]))
    const orderingEnabled = isSuperAdmin || state["qr-ordering-pro"] === true || state["qr-menu"] === true
    const printEnabled = state["qr-print-center"] === true

    // Restaurant Admin's internal QR page is intentionally gated by the
    // separate Print Center plugin. This does NOT disable the public QR
    // ordering runtime when Advanced QR Ordering is active.
    const adminDashboardEnabled = isSuperAdmin ? (orderingEnabled || printEnabled) : printEnabled

    return NextResponse.json({
      success: true,
      enabled: adminDashboardEnabled,
      orderingEnabled,
      printEnabled,
      reason: adminDashboardEnabled ? null : "qr-print-center"
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to check QR access" }, { status: 401 })
  }
}
