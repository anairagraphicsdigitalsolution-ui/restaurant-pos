import { requireApiUser } from "@/lib/serverAuth"
import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"

function cleanNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json().catch(() => ({}))
    const restaurantId = String(body?.restaurant_id || "").trim()
    const orders = Array.isArray(body?.orders) ? body.orders : []
    if (!restaurantId || !orders.length) return Response.json({ success: false, error: "Restaurant and orders are required" }, { status: 400 })

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("restaurant_id,role")
      .eq("id", user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (profile?.role !== "super_admin" && profile?.restaurant_id !== restaurantId) {
      return Response.json({ success: false, error: "Restaurant access denied" }, { status: 403 })
    }

    const results = []
    for (const input of orders.slice(0, 100)) {
      const id = String(input?.id || "").trim()
      if (!id) continue
      const items = Array.isArray(input?.items) ? input.items : []
      const createdAt = input?.offline_created_at || input?.created_at || new Date().toISOString()
      const row = {
        id,
        restaurant_id: restaurantId,
        source_type: input?.source_type || "table",
        source_id: input?.source_id || null,
        source_label: input?.source_label || null,
        overall_note: input?.overall_note || null,
        status: input?.status || "pending",
        created_at: createdAt,
        subtotal: cleanNumber(input?.subtotal),
        discount_amount: cleanNumber(input?.discount_amount),
        tax_amount: cleanNumber(input?.tax_amount),
        total_amount: cleanNumber(input?.total_amount),
        delivery_charge: cleanNumber(input?.delivery_charge),
        service_charge: cleanNumber(input?.service_charge),
        packaging_charge: cleanNumber(input?.packaging_charge),
        payment_status: input?.payment_status || "unpaid",
        paid_amount: cleanNumber(input?.paid_amount),
        payment_method: input?.payment_method || null,
        customer_id: input?.customer_id || null,
        order_mode: input?.order_mode || "dine_in",
        customer_note: input?.customer_note || null,
        delivery_address: input?.delivery_address || null,
        invoice_no: null,
        sync_status: "pending",
        offline_created_at: createdAt,
        offline_bill_ready: Boolean(input?.offline_bill_ready),
        offline_bill_ready_at: input?.offline_bill_ready_at || null,
        offline_payment_id: input?.offline_payment_id || null,
      }

      const { error: orderError } = await supabaseAdmin
        .from("orders")
        .upsert(row, { onConflict: "id" })
      if (orderError) throw orderError

      for (const item of items) {
        const itemId = String(item?.id || crypto.randomUUID())
        const { error: itemError } = await supabaseAdmin.from("order_items").upsert({
          id: itemId,
          order_id: id,
          item_id: item?.item_id || null,
          item_name: item?.item_name || item?.name || "Item",
          quantity: cleanNumber(item?.quantity, 1),
          unit_price: cleanNumber(item?.unit_price),
          line_total: cleanNumber(item?.line_total),
          cooking_request: item?.cooking_request || null,
        }, { onConflict: "id" })
        if (itemError) throw itemError
      }

      if (input?.offline_bill_ready && cleanNumber(input?.offline_paid_amount ?? input?.paid_amount) > 0) {
        const paymentId = String(input?.offline_payment_id || crypto.randomUUID())
        const paymentAmount = cleanNumber(input?.offline_paid_amount ?? input?.paid_amount)
        const { error: paymentError } = await supabaseAdmin.from("order_payments").upsert({
          id: paymentId,
          restaurant_id: restaurantId,
          order_id: id,
          payment_method: input?.payment_method || "cash",
          amount: paymentAmount,
          reference: input?.payment_reference || null,
          status: "paid",
          paid_at: input?.offline_bill_ready_at || new Date().toISOString(),
          created_by: user.id,
          notes: "Captured offline; reconciled at Cloud sync"
        }, { onConflict: "id" })
        if (paymentError) throw paymentError
        const { error: orderPaymentStateError } = await supabaseAdmin.from("orders").update({
          status: "done",
          payment_status: "paid",
          paid_amount: paymentAmount,
          payment_method: input?.payment_method || "cash",
          offline_bill_ready: false
        }).eq("id", id).eq("restaurant_id", restaurantId)
        if (orderPaymentStateError) throw orderPaymentStateError
      }

      const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc("finalize_synced_order_numbers", { p_order_id: id })
      if (finalizeError) throw finalizeError

      const { data: cloudOrder, error: fetchError } = await supabaseAdmin
        .from("orders")
        .select("*")
        .eq("id", id)
        .single()
      if (fetchError) throw fetchError

      results.push({ ...cloudOrder, sync_result: finalized })
    }

    return Response.json({ success: true, orders: results })
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Mobile sync failed" }, { status: 400 })
  }
}
