import { requireFeature } from "@/lib/featureGateServer"
import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { requireStaffPermission } from "@/lib/serverStaffPermissions"

export const runtime = "nodejs"

async function context(req, permission = "customers") {
  const user = await requireApiUser(req)
  const r = await resolveRestaurantForUser(user)
  if (!r.restaurantId) throw new Error("Restaurant not found")
  await requireFeature(r.restaurantId, "p2-call-center")
  await requireStaffPermission(user, r.restaurantId, permission)
  return { user, restaurantId: r.restaurantId }
}

export async function GET(req) {
  try {
    const { restaurantId } = await context(req)
    const url = new URL(req.url)
    const phone = url.searchParams.get("phone")?.trim() || ""
    const status = url.searchParams.get("status") || ""

    const [{ data: calls, error: callError }, { data: agents, error: agentError }] = await Promise.all([
      supabaseCloudAdmin.from("p2_1_call_sessions").select("*,customer:customers(id,name,phone,email,total_orders,total_spend,loyalty_points,last_visit_at),agent:profiles!p2_1_call_sessions_agent_id_fkey(id,email,role)").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(100),
      supabaseCloudAdmin.from("profiles").select("id,email,role").eq("restaurant_id", restaurantId).order("email")
    ])
    if (callError) throw callError
    if (agentError) throw agentError

    let customer = null
    let orders = []
    let history = []
    if (phone) {
      const { data, error } = await supabaseCloudAdmin.rpc("p2_1_identify_caller", { p_restaurant_id: restaurantId, p_phone: phone })
      if (error) throw error
      customer = data?.customer || null
      orders = data?.orders || []
      history = data?.call_history || []
    }

    return NextResponse.json({ success: true, restaurant_id: restaurantId, calls: status ? (calls || []).filter(x => x.status === status) : (calls || []), agents: agents || [], customer, orders, history })
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || "Unable to load call center" }, { status: /access|authorized|permission|authentication/i.test(e?.message || "") ? 403 : 400 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const action = String(body?.action || "")
    const permission = action === "reorder" ? "orders" : "customers"
    const { user, restaurantId } = await context(req, permission)

    if (action === "create") {
      if (!body.idempotency_key) throw new Error("Idempotency key is required")
      const { data, error } = await supabaseCloudAdmin.rpc("p2_1_create_call", {
        p_restaurant_id: restaurantId,
        p_phone: body.phone || "",
        p_name: body.name || "",
        p_subject: body.subject || "",
        p_notes: body.notes || "",
        p_idempotency_key: body.idempotency_key,
      })
      if (error) throw error
      return NextResponse.json({ success: true, call_id: data })
    }

    if (action === "assign") {
      const { data, error } = await supabaseCloudAdmin.rpc("p2_1_assign_call", { p_restaurant_id: restaurantId, p_call_id: body.call_id, p_agent_id: body.agent_id })
      if (error) throw error
      return NextResponse.json({ success: true, updated: data })
    }

    if (action === "callback") {
      const { data, error } = await supabaseCloudAdmin.rpc("p2_1_schedule_callback", { p_restaurant_id: restaurantId, p_call_id: body.call_id, p_callback_at: body.callback_at })
      if (error) throw error
      return NextResponse.json({ success: true, updated: data })
    }

    if (action === "resolve") {
      const { data, error } = await supabaseCloudAdmin.rpc("p2_1_resolve_call", { p_restaurant_id: restaurantId, p_call_id: body.call_id, p_notes: body.notes || "" })
      if (error) throw error
      return NextResponse.json({ success: true, updated: data })
    }

    if (action === "delivery") {
      if (!body.call_id) throw new Error("Call ID is required")
      const { data: call, error: callError } = await supabaseCloudAdmin.from("p2_1_call_sessions").select("id,customer_id,caller_name,caller_phone,notes").eq("id", body.call_id).eq("restaurant_id", restaurantId).maybeSingle()
      if (callError) throw callError
      if (!call) throw new Error("Call not found")
      const { error } = await supabaseCloudAdmin.from("p2_1_call_events").insert({ restaurant_id: restaurantId, call_session_id: call.id, event_type: "delivery_requested", actor_id: user.id, payload: { address: body.address || "", phone: body.phone || call.caller_phone || "", customer_id: call.customer_id } })
      if (error) throw error
      await supabaseCloudAdmin.from("p2_1_call_sessions").update({ delivery_required: true, delivery_address: body.address || null, updated_at: new Date().toISOString() }).eq("id", call.id).eq("restaurant_id", restaurantId)
      return NextResponse.json({ success: true, message: "Delivery request recorded. Create/finalize the delivery order in POS." })
    }

    if (action === "reorder") {
      if (!body.order_id) throw new Error("Order ID is required")
      const { data: order, error: orderError } = await supabaseCloudAdmin.from("orders").select("id,restaurant_id,customer_id,customer_name,customer_phone,delivery_address,order_mode,order_items(*)").eq("id", body.order_id).eq("restaurant_id", restaurantId).maybeSingle()
      if (orderError) throw orderError
      if (!order) throw new Error("Order not found")
      const { data: items, error: itemsError } = await supabaseCloudAdmin.from("order_items").select("id,item_id,item_name,quantity,unit_price,line_total,variant_id,variant_name,cooking_request").eq("order_id", order.id).order("id")
      if (itemsError) throw itemsError
      return NextResponse.json({ success: true, reorder: { customer_id: order.customer_id, customer_name: order.customer_name, customer_phone: order.customer_phone, delivery_address: order.delivery_address, order_mode: order.order_mode, items: items || [] }, message: "Items prepared for quick reorder. Review in POS before billing." })
    }

    throw new Error("Unsupported call-center action")
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || "Call center action failed" }, { status: /access|authorized|permission|authentication/i.test(e?.message || "") ? 403 : 400 })
  }
}
