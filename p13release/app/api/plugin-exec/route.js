import { runPlugin } from "@/lib/pluginManager"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

async function getAuthorizedContext(userId, restaurantId, allowedRoles = ["admin", "super_admin"]) {
  const { data: profile, error } = await supabaseCloudAdmin
    .from("profiles")
    .select("id, role, restaurant_id")
    .eq("id", userId)
    .maybeSingle()

  if (error || !profile) throw new Error("Profile not found")
  if (!allowedRoles.includes(profile.role)) throw new Error("Not authorized")

  if (profile.role !== "super_admin" && profile.restaurant_id !== restaurantId) {
    throw new Error("Not authorized for this restaurant")
  }

  return profile
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json()

    const restaurantId = String(body?.restaurant_id || "").trim()
    const pluginCode = String(body?.plugin_code || "").trim()
    const action = String(body?.action || "").trim()

    if (!restaurantId || !pluginCode || !action) {
      return Response.json(
        { success: false, error: "restaurant_id, plugin_code and action are required" },
        { status: 400 }
      )
    }

    await getAuthorizedContext(user.id, restaurantId)

    const result = await runPlugin(
      restaurantId,
      pluginCode,
      action,
      body?.data ?? {}
    )

    return Response.json({ success: true, result })
  } catch (err) {
    console.error("PLUGIN EXEC ERROR:", err)
    const status = /authorized|profile/i.test(err?.message || "") ? 403 : 400
    return Response.json(
      { success: false, error: err?.message || "Plugin execution failed" },
      { status }
    )
  }
}
