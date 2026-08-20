import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { requireFeature } from "@/lib/featureGateServer"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json()

    const orderId = String(body?.order_id || "").trim()
    const status = String(body?.status || "").trim().toLowerCase()
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null

    if (!orderId || !["pending", "preparing", "done", "cancelled"].includes(status)) {
      return Response.json({ success: false, error: "Invalid order status" }, { status: 400 })
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("restaurant_id")
      .eq("id", orderId)
      .maybeSingle()

    if (!order?.restaurant_id) {
      return Response.json({ success:false, error:"Order not found" }, { status:404 })
    }

    try {
      await requireFeature(order.restaurant_id, "kds")
    } catch (featureError) {
      return Response.json({ success:false, error:featureError.message }, { status:403 })
    }

    const { data, error } = await supabaseAdmin.rpc("stage3_update_order_status", {
      p_actor_id: user.id,
      p_order_id: orderId,
      p_status: status,
      p_reason: reason
    })

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 400 })
    }

    return Response.json({ success: true, order: data })
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || "Unable to update order" },
      { status: 401 }
    )
  }
}
