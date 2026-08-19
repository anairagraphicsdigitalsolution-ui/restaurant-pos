import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)

    const restaurantId = new URL(req.url).searchParams.get("restaurant_id")

    if (!restaurantId) {
      return NextResponse.json(
        {
          success: false,
          error: "Restaurant is required"
        },
        { status: 400 }
      )
    }

    /*
     * ------------------------------------------------------------
     * Verify that the logged-in user belongs to this restaurant.
     * Super Admin is allowed to inspect any restaurant.
     * ------------------------------------------------------------
     */

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("restaurant_id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("QR MENU PROFILE ERROR:", profileError)

      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify restaurant"
        },
        { status: 500 }
      )
    }

    const isSuperAdmin = profile?.role === "super_admin"

    if (!isSuperAdmin && profile?.restaurant_id !== restaurantId) {
      return NextResponse.json(
        {
          success: false,
          error: "Restaurant access denied"
        },
        { status: 403 }
      )
    }

    /*
     * ------------------------------------------------------------
     * Check active plan
     * ------------------------------------------------------------
     */

    const { data: planEnabled, error: planError } =
      await supabaseAdmin.rpc("has_restaurant_plan_feature", {
        p_restaurant_id: restaurantId,
        p_plugin_code: "qr-menu"
      })

    if (planError) {
      console.error("QR MENU PLAN ERROR:", planError)

      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify QR Menu plan"
        },
        { status: 500 }
      )
    }

    if (planEnabled !== true) {
      return NextResponse.json({
        success: true,
        enabled: false,
        reason: "plan"
      })
    }

    /*
     * ------------------------------------------------------------
     * Check plugin installation / enabled status
     * ------------------------------------------------------------
     */

    const { data: plugin, error: pluginError } =
      await supabaseAdmin
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "qr-menu")
        .maybeSingle()

    if (pluginError) {
      console.error("QR MENU PLUGIN ERROR:", pluginError)

      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify QR Menu plugin"
        },
        { status: 500 }
      )
    }

    if (!plugin?.enabled) {
      return NextResponse.json({
        success: true,
        enabled: false,
        reason: "plugin"
      })
    }

    return NextResponse.json({
      success: true,
      enabled: true
    })
  } catch (error) {
    console.error("QR MENU ACCESS ERROR:", error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to check QR Menu access"
      },
      { status: 401 }
    )
  }
}