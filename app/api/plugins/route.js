import { installPlugin } from "@/lib/pluginManager"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

async function getAuthorizedContext(userId, restaurantId) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, restaurant_id")
    .eq("id", userId)
    .maybeSingle()

  if (error || !profile) throw new Error("Profile not found")
  if (profile.role !== "super_admin") {
    throw new Error("Super Admin access required")
  }

  return profile
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json()

    const restaurantId = String(body?.restaurant_id || "").trim()
    const pluginCode = String(body?.plugin_code || "").trim()

    if (!restaurantId || !pluginCode) {
      return Response.json(
        { success: false, error: "restaurant_id and plugin_code are required" },
        { status: 400 }
      )
    }

    await getAuthorizedContext(user.id, restaurantId)

    const result = await installPlugin(
      restaurantId,
      pluginCode,
      body?.config && typeof body.config === "object" ? body.config : {}
    )

    return Response.json({
      success: true,
      message: "Plugin installed",
      result
    })
  } catch (err) {
    console.error("PLUGIN INSTALL ERROR:", err)
    const status = /authorized|profile/i.test(err?.message || "") ? 403 : 400
    return Response.json(
      { success: false, error: err?.message || "Plugin installation failed" },
      { status }
    )
  }
}
