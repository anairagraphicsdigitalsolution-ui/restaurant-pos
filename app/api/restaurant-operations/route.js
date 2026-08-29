import { indiaDateKey } from "@/lib/indiaTime"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

async function restaurantForUser(user) {
  const resolved = await resolveRestaurantForUser(user)
  if (!resolved.restaurantId) throw new Error("Restaurant profile not found")
  return { restaurant_id: resolved.restaurantId, role: resolved.role }
}

async function audit(rid, userId, action, entityType, entityId, afterData = null, reason = null) {
  await supabaseAdmin.from("pos_audit_events").insert({ restaurant_id: rid, actor_id: userId, action, entity_type: entityType, entity_id: entityId || null, after_data: afterData, reason })
}

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const resolved = await resolveRestaurantForUser(user)
    const rid = resolved.restaurantId
    if (!rid) throw new Error("Restaurant profile not found")

    const pluginRes = await supabaseAdmin.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id", rid)
    if (pluginRes.error) throw pluginRes.error
    const plugins = Object.fromEntries((pluginRes.data || []).map(x => [x.plugin_code, x.enabled === true]))
    if (!plugins["operations-hub"]) return NextResponse.json({ success: true, enabled: false, restaurant_id: rid, data: {}, plugins })

    const queries = {
      restaurant: supabaseAdmin.from("restaurants").select("name").eq("id", rid).maybeSingle(),
      customers: supabaseAdmin.from("customers").select("*").eq("restaurant_id", rid).order("updated_at", { ascending: false }),
      groups: supabaseAdmin.from("modifier_groups").select("*").eq("restaurant_id", rid).order("created_at"),
      mods: supabaseAdmin.from("modifiers").select("*").eq("restaurant_id", rid).order("created_at"),
      menu: supabaseAdmin.from("menu_items").select("id,name,category,price").eq("restaurant_id", rid).order("name"),
      expenses: supabaseAdmin.from("expenses").select("*").eq("restaurant_id", rid).order("expense_date", { ascending: false }).limit(100),
      attendance: supabaseAdmin.from("staff_attendance").select("*").eq("restaurant_id", rid).order("clock_in", { ascending: false }).limit(100),
      feedback: supabaseAdmin.from("customer_feedback").select("*").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(100),
      staff: supabaseAdmin.from("profiles").select("id,email,role").eq("restaurant_id", rid).order("email"),
      kots: supabaseAdmin.from("kot_tickets").select("*").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(50),
      orders: supabaseAdmin.from("orders").select("id,status,total_amount,created_at,source_type,source_id,source_label").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(100),
      loyaltyTx: supabaseAdmin.from("loyalty_transactions").select("id,customer_id,points,transaction_type,note,created_at").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(100),
      loyaltySettings: supabaseAdmin.from("loyalty_settings").select("*").eq("restaurant_id", rid).maybeSingle(),
      loyaltyTiers: supabaseAdmin.from("loyalty_tiers").select("*").eq("restaurant_id", rid).order("min_points"),
      loyaltyRewards: supabaseAdmin.from("loyalty_rewards").select("*").eq("restaurant_id", rid).order("points_cost"),
      loyaltyCampaigns: supabaseAdmin.from("loyalty_campaigns").select("*").eq("restaurant_id", rid).order("created_at", { ascending: false }),
      loyaltyReferrals: supabaseAdmin.from("loyalty_referrals").select("*").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(100),
      loyaltyRedemptions: supabaseAdmin.from("loyalty_redemptions").select("id,customer_id,reward_id,points,status,created_at").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(100),
      permissions: supabaseAdmin.from("staff_permissions").select("id,staff_id,permission_key,enabled,updated_at").eq("restaurant_id", rid),
    }
    const settled = await Promise.all(Object.entries(queries).map(async ([key, query]) => [key, await query]))
    const results = Object.fromEntries(settled)
    const errors = Object.entries(results).filter(([, v]) => v?.error).map(([key, v]) => ({ key, error: v.error.message, code: v.error.code }))
    if (errors.length) console.error("Operations Hub data query failures", { rid, errors })
    const data = Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value?.data || []]))
    return NextResponse.json({ success: true, enabled: true, restaurant_id: rid, name: results.restaurant?.data?.name || "Restaurant", plugins, data, errors })
  } catch (e) {
    console.error("restaurant operations GET", e)
    return NextResponse.json({ success: false, error: e.message || "Unable to load Operations Hub data" }, { status: 400 })
  }
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const profile = await restaurantForUser(user)
    const rid = profile.restaurant_id
    const body = await req.json()
    const action = String(body.action || "").trim()
    if (!action) throw new Error("Action is required")

    if (action === "table_status") {
      const { data, error } = await supabaseAdmin.rpc("set_dining_table_status", { p_restaurant_id: rid, p_table_id: body.table_id, p_status: body.status })
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    if (action === "hold_order") {
      if (!body.order_id) throw new Error("Order is required")
      const { data, error } = await supabaseAdmin.from("order_holds").insert({ restaurant_id: rid, order_id: body.order_id, hold_type: body.hold_type || "hold", note: body.note || null, created_by: user.id }).select().single()
      if (error) throw error
      await supabaseAdmin.from("orders").update({ hold_status: "held" }).eq("id", body.order_id).eq("restaurant_id", rid)
      await audit(rid, user.id, "order.held", "order", body.order_id, { hold_id: data.id })
      return NextResponse.json({ success: true, data })
    }
    if (action === "resume_order") {
      if (!body.order_id) throw new Error("Order is required")
      const { error: holdError } = await supabaseAdmin.from("order_holds").update({ released_at: new Date().toISOString() }).eq("restaurant_id", rid).eq("order_id", body.order_id).is("released_at", null)
      if (holdError) throw holdError
      const { error } = await supabaseAdmin.from("orders").update({ hold_status: "active" }).eq("id", body.order_id).eq("restaurant_id", rid)
      if (error) throw error
      await audit(rid, user.id, "order.resumed", "order", body.order_id, { hold_status: "active" })
      return NextResponse.json({ success: true })
    }
    if (action === "reopen_order") {
      if (!body.order_id) throw new Error("Order is required")
      const { error } = await supabaseAdmin.from("orders").update({ status: "open", reopened_at: new Date().toISOString() }).eq("id", body.order_id).eq("restaurant_id", rid)
      if (error) throw error
      await supabaseAdmin.from("order_status_history").insert({ restaurant_id: rid, order_id: body.order_id, status: "open", source: "reopen", note: body.reason || "Reopened", changed_by: user.id })
      await audit(rid, user.id, "order.reopened", "order", body.order_id, { status: "open" }, body.reason)
      return NextResponse.json({ success: true })
    }
    if (action === "table_transfer") {
      if (!body.order_id || !body.to_table_id) throw new Error("Order and destination table are required")
      const { data: order, error: orderError } = await supabaseAdmin.from("orders").select("table_id").eq("id", body.order_id).eq("restaurant_id", rid).single()
      if (orderError) throw orderError
      const { error } = await supabaseAdmin.from("orders").update({ table_id: body.to_table_id }).eq("id", body.order_id).eq("restaurant_id", rid)
      if (error) throw error
      await supabaseAdmin.from("order_transfers").insert({ restaurant_id: rid, order_id: body.order_id, from_table_id: order.table_id || null, to_table_id: body.to_table_id, moved_by: user.id })
      await audit(rid, user.id, "table.transfer", "order", body.order_id, { from_table_id: order.table_id, to_table_id: body.to_table_id })
      return NextResponse.json({ success: true })
    }
    if (action === "reservation_deposit") {
      if (!body.reservation_id || Number(body.amount || 0) <= 0) throw new Error("Reservation and positive deposit are required")
      const { data, error } = await supabaseAdmin.from("reservation_deposits").insert({ restaurant_id: rid, reservation_id: body.reservation_id, amount: Number(body.amount), payment_method: body.payment_method || "upi", reference: body.reference || null, status: "paid", paid_at: new Date().toISOString() }).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    if (action === "feedback_request") {
      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const { data, error } = await supabaseAdmin.from("feedback_requests").insert({ restaurant_id: rid, order_id: body.order_id || null, customer_id: body.customer_id || null, channel: body.channel || "qr", token, status: "pending", sent_at: new Date().toISOString() }).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    if (action === "cash_movement") {
      const amount = Number(body.amount || 0)
      if (amount <= 0 || !body.shift_id) throw new Error("Shift and positive amount are required")
      const { data, error } = await supabaseAdmin.from("cash_movements").insert({ restaurant_id: rid, session_id: body.shift_id, movement_type: body.movement_type || "cash_in", amount, reference: body.reference || null, note: body.note || null, created_by: user.id }).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    if (action === "report_export") {
      const { data, error } = await supabaseAdmin.from("report_exports").insert({ restaurant_id: rid, report_type: body.report_type || "sales", filters: body.filters || {}, format: body.format || "csv", status: "requested", requested_by: user.id }).select().single()
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
    if (action === "wallet_adjust") {
      if (!body.customer_id) throw new Error("Customer is required")
      const points = Number(body.points || 0)
      const amount = Number(body.amount || 0)
      if (!points && !amount) throw new Error("Points or amount is required")
      const { data: existing } = await supabaseAdmin
        .from("customer_wallets")
        .select("*")
        .eq("restaurant_id", rid)
        .eq("customer_id", body.customer_id)
        .maybeSingle()
      const current = existing || { balance: 0, points: 0 }
      const nextBalance = Number(current.balance || 0) + amount
      const nextPoints = Number(current.points || 0) + points
      if (nextBalance < 0 || nextPoints < 0) throw new Error("Wallet balance cannot become negative")
      const { data: wallet, error: walletError } = await supabaseAdmin
        .from("customer_wallets")
        .upsert({ restaurant_id: rid, customer_id: body.customer_id, balance: nextBalance, points: nextPoints, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id,customer_id" })
        .select()
        .single()
      if (walletError) throw walletError
      const { error: txError } = await supabaseAdmin.from("customer_wallet_transactions").insert({
        restaurant_id: rid,
        customer_id: body.customer_id,
        wallet_id: wallet.id,
        transaction_type: body.transaction_type || "adjustment",
        amount,
        points,
        notes: body.note || null,
        created_at: new Date().toISOString(),
      })
      if (txError) throw txError
      await audit(rid, user.id, "wallet.adjusted", "customer", body.customer_id, { balance: nextBalance, points: nextPoints }, body.note)
      return NextResponse.json({ success: true, wallet })
    }
    if (action === "display_call") {
      const { data, error } = await supabaseAdmin.from("digital_display_calls").insert({
        restaurant_id: rid,
        token_no: body.token_no || null,
        display_name: body.display_name || null,
        message: body.message || null,
        status: "queued",
      }).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }
    if (action === "delivery_settlement") {
      const expectedCash = Number(body.expected_cash || 0)
      const expectedUpi = Number(body.expected_upi || 0)
      const expectedCard = Number(body.expected_card || 0)
      const submittedCash = Number(body.submitted_cash || 0)
      const submittedUpi = Number(body.submitted_upi || 0)
      const submittedCard = Number(body.submitted_card || 0)
      const difference = submittedCash + submittedUpi + submittedCard - expectedCash - expectedUpi - expectedCard
      const { data, error } = await supabaseAdmin.from("delivery_settlements").insert({
        restaurant_id: rid,
        rider_id: body.rider_id || null,
        rider_name: body.rider_name || null,
        settlement_date: body.settlement_date || indiaDateKey(),
        expected_cash: expectedCash,
        expected_upi: expectedUpi,
        expected_card: expectedCard,
        submitted_cash: submittedCash,
        submitted_upi: submittedUpi,
        submitted_card: submittedCard,
        difference: Number(difference.toFixed(2)),
        status: "settled",
        notes: body.notes || null,
        created_by: user.id,
        settled_at: new Date().toISOString(),
      }).select().single()
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
    console.error("restaurant operations", error)
    return NextResponse.json({ success: false, error: error?.message || "Operation failed" }, { status: 400 })
  }
}
