import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json()

    const inventoryId = String(body?.inventory_id || "").trim()
    const delta = Number(body?.delta)
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : "Manual adjustment"
    const requestKey = String(body?.request_id || body?.idempotency_key || "").trim()
    if (!requestKey) return Response.json({ success: false, error: "request_id is required for inventory mutation" }, { status: 400 })

    const requestHash = JSON.stringify({ inventoryId, delta, reason })
    const { data: prior } = await supabaseCloudAdmin.from("p0_transaction_requests").select("status,response,error_message").eq("restaurant_id", user.restaurant_id).eq("request_key", requestKey).eq("operation", "inventory_adjust").maybeSingle()
    if (prior?.status === "succeeded") return Response.json(prior.response || { success: true, duplicate: true })
    if (prior?.status === "processing") return Response.json({ success: true, duplicate: true, pending: true }, { status: 202 })

    const { error: reqErr } = await supabaseCloudAdmin.from("p0_transaction_requests").upsert({ restaurant_id: user.restaurant_id, request_key: requestKey, operation: "inventory_adjust", request_hash: requestHash, status: "processing", updated_at: new Date().toISOString() }, { onConflict: "restaurant_id,request_key,operation" })
    if (reqErr) throw reqErr

    if (!inventoryId || !Number.isInteger(delta) || delta === 0) {
      return Response.json({ success: false, error: "Invalid inventory adjustment" }, { status: 400 })
    }

    const { data, error } = await supabaseCloudAdmin.rpc("stage3_adjust_inventory", {
      p_actor_id: user.id,
      p_inventory_id: inventoryId,
      p_delta: delta,
      p_reason: reason
    })

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 400 })
    }

    const response = { success: true, inventory: data, duplicate: false }
    await supabaseCloudAdmin.from("p0_transaction_requests").update({ status: "succeeded", response, updated_at: new Date().toISOString() }).eq("restaurant_id", user.restaurant_id).eq("request_key", requestKey).eq("operation", "inventory_adjust")
    return Response.json(response)
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || "Inventory update failed" },
      { status: error?.status || 500 }
    )
  }
}
