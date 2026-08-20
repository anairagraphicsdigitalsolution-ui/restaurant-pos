import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

async function restaurantForUser(userId) {
  const { data, error } = await supabaseAdmin.from("profiles").select("restaurant_id,role").eq("id", userId).single()
  if (error || !data?.restaurant_id) throw new Error("Restaurant profile not found")
  return data
}

async function audit(rid, userId, action, entityType, entityId, afterData = null, reason = null) {
  await supabaseAdmin.from("pos_audit_events").insert({ restaurant_id: rid, actor_id: userId, action, entity_type: entityType, entity_id: entityId || null, after_data: afterData, reason })
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const profile = await restaurantForUser(user.id)
    const rid = profile.restaurant_id
    const body = await req.json()
    const action = String(body.action || "").trim()
    if (!action) throw new Error("Action is required")

    if (action === "table_status") {
      const { data, error } = await supabaseAdmin.rpc("set_dining_table_status", { p_restaurant_id: rid, p_table_id: body.table_id, p_status: body.status })
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    if (action === "payment") {
      const amount = Number(body.amount || 0)
      if (!body.order_id || amount <= 0) throw new Error("Order and positive amount are required")
      const method = ["cash", "upi", "card", "online", "credit", "other"].includes(body.payment_method) ? body.payment_method : "cash"
      const { data, error } = await supabaseAdmin.from("order_payments").insert({ restaurant_id: rid, order_id: body.order_id, payment_method: method, amount, reference: body.reference || null, status: "paid", created_by: user.id }).select().single()
      if (error) throw error
      await audit(rid, user.id, "payment.recorded", "order", body.order_id, { amount, method })
      return NextResponse.json({ success: true, data })
    }
    if (action === "split") {
      const parts = Math.max(2, Math.floor(Number(body.parts || 2)))
      const { data: order, error: orderError } = await supabaseAdmin.from("orders").select("total_amount").eq("id", body.order_id).eq("restaurant_id", rid).single()
      if (orderError) throw orderError
      const each = Number(order.total_amount || 0) / parts
      const rows = Array.from({ length: parts }, (_, i) => ({ restaurant_id: rid, order_id: body.order_id, split_no: i + 1, amount: Number(each.toFixed(2)) }))
      const { error } = await supabaseAdmin.from("order_splits").upsert(rows, { onConflict: "order_id,split_no" })
      if (error) throw error
      await audit(rid, user.id, "bill.split", "order", body.order_id, { parts })
      return NextResponse.json({ success: true, parts })
    }
    if (action === "refund") {
      const amount = Number(body.amount || 0)
      if (!body.order_id || amount <= 0) throw new Error("Order and positive refund amount are required")
      const { data: payment } = await supabaseAdmin.from("order_payments").select("id").eq("restaurant_id", rid).eq("order_id", body.order_id).eq("status", "paid").order("created_at", { ascending: false }).limit(1).maybeSingle()
      const { error } = await supabaseAdmin.from("order_refunds").insert({ restaurant_id: rid, order_id: body.order_id, payment_id: payment?.id || null, amount, reason: body.reason || "Customer refund", created_by: user.id })
      if (error) throw error
      await audit(rid, user.id, "refund.created", "order", body.order_id, { amount }, body.reason)
      return NextResponse.json({ success: true })
    }
    if (action === "void") {
      const { error } = await supabaseAdmin.from("orders").update({ status: "cancelled", void_reason: body.reason || "Voided by staff", cancelled_at: new Date().toISOString() }).eq("id", body.order_id).eq("restaurant_id", rid)
      if (error) throw error
      await audit(rid, user.id, "order.voided", "order", body.order_id, { status: "cancelled" }, body.reason)
      return NextResponse.json({ success: true })
    }
    if (action === "kds") {
      const status = String(body.status || "new")
      const timestamps = { accepted: "acknowledged_at", preparing: "acknowledged_at", ready: "completed_at", served: "completed_at" }
      const patch = { restaurant_id: rid, order_id: body.order_id, status, priority: body.priority || "normal" }
      if (timestamps[status]) patch[timestamps[status]] = new Date().toISOString()
      const { error } = await supabaseAdmin.from("kds_events").insert(patch)
      if (error) throw error
      await supabaseAdmin.from("orders").update({ status }).eq("id", body.order_id).eq("restaurant_id", rid)
      await supabaseAdmin.from("order_status_history").insert({ restaurant_id: rid, order_id: body.order_id, status, source: "kds", changed_by: user.id })
      return NextResponse.json({ success: true })
    }
    if (action === "delivery_assign") {
      if (!body.order_id || !body.rider_id) throw new Error("Order and rider are required")
      const { data, error } = await supabaseAdmin.from("delivery_assignments").insert({ restaurant_id: rid, order_id: body.order_id, rider_id: body.rider_id, address: body.address || null, delivery_charge: Number(body.delivery_charge || 0), status: "assigned" }).select().single()
      if (error) throw error
      await audit(rid, user.id, "delivery.assigned", "order", body.order_id, { rider_id: body.rider_id })
      return NextResponse.json({ success: true, data })
    }
    if (action === "delivery_status") {
      const patch = { status: body.status }
      if (body.status === "out_for_delivery") patch.out_at = new Date().toISOString()
      if (body.status === "delivered") patch.delivered_at = new Date().toISOString()
      if (body.status === "failed") { patch.failed_at = new Date().toISOString(); patch.failure_reason = body.failure_reason || "Delivery failed" }
      const { error } = await supabaseAdmin.from("delivery_assignments").update(patch).eq("id", body.assignment_id).eq("restaurant_id", rid)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (action === "issue_token") {
      const { data, error } = await supabaseAdmin.rpc("issue_order_token", { p_restaurant_id: rid, p_order_id: body.order_id || null, p_token_type: body.token_type || "pickup", p_display_name: body.display_name || null })
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    if (action === "token_status") {
      const patch = { status: body.status }
      if (body.status === "called") patch.called_at = new Date().toISOString()
      if (body.status === "ready") patch.ready_at = new Date().toISOString()
      if (body.status === "completed") patch.completed_at = new Date().toISOString()
      const { error } = await supabaseAdmin.from("order_tokens").update(patch).eq("id", body.id).eq("restaurant_id", rid)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (action === "waitlist_status") {
      const { error } = await supabaseAdmin.from("reservation_waitlist").update({ status: body.status, called_at: body.status === "called" ? new Date().toISOString() : null }).eq("id", body.id).eq("restaurant_id", rid)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (action === "aggregator_sync") {
      const { data, error } = await supabaseAdmin.from("aggregator_sync_jobs").insert({ restaurant_id: rid, provider: body.provider || "zomato", job_type: body.job_type || "orders", payload: body.payload || {}, status: "queued" }).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    if (action === "queue_message") {
      const { data, error } = await supabaseAdmin.from("message_queue").insert({ restaurant_id: rid, channel: body.channel || "whatsapp", purpose: body.purpose || "general", recipient: body.recipient || null, template: body.template || null, payload: body.payload || {}, status: "queued" }).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    if (action === "close_shift") {
      const actual = Number(body.actual_cash || 0)
      const { data: shift, error: shiftError } = await supabaseAdmin.from("cash_shifts").select("expected_cash").eq("id", body.shift_id).eq("restaurant_id", rid).single()
      if (shiftError) throw shiftError
      const { error } = await supabaseAdmin.from("cash_shifts").update({ actual_cash: actual, difference: actual - Number(shift.expected_cash || 0), status: "closed", closed_at: new Date().toISOString() }).eq("id", body.shift_id).eq("restaurant_id", rid)
      if (error) throw error
      await audit(rid, user.id, "cash.shift.closed", "cash_shift", body.shift_id, { actual_cash: actual })
      return NextResponse.json({ success: true })
    }
    if (action === "print_job") {
      const { data, error } = await supabaseAdmin.from("print_jobs").insert({ restaurant_id: rid, job_type: body.job_type || "bill", reference_id: body.reference_id || null, payload: body.payload || {}, status: "queued" }).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    throw new Error("Unsupported action")
  } catch (error) {
    console.error("petpooja parity", error)
    return NextResponse.json({ success: false, error: error?.message || "Operation failed" }, { status: 400 })
  }
}
