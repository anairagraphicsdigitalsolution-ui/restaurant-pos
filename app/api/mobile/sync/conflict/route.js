import { requireApiUser } from "@/lib/serverAuth"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json().catch(() => ({}))
    const restaurantId = String(body.restaurant_id || "").trim()
    if (!restaurantId) throw new Error("Restaurant is required")
    if (user.role !== "super_admin" && user.restaurant_id !== restaurantId) throw new Error("Restaurant access denied")
    const { data, error } = await supabaseCloudAdmin.from("p0_sync_conflicts").insert({
      restaurant_id: restaurantId,
      entity: String(body.entity || "unknown").slice(0,120),
      entity_id: body.entity_id || null,
      direction: body.direction === "local_to_cloud" ? "local_to_cloud" : "cloud_to_local",
      resolution: String(body.resolution || "manual"),
      local_data: body.local || null,
      incoming_data: body.incoming || null,
      metadata: { device_id: body.device_id || null, source: "mobile-sync" }
    }).select("id,created_at").single()
    if (error) throw error
    return Response.json({ success: true, conflict: data })
  } catch (e) {
    return Response.json({ success: false, error: e?.message || "Unable to record sync conflict" }, { status: /access|auth/i.test(e?.message || "") ? 403 : 400 })
  }
}
