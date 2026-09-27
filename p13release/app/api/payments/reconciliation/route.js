import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

async function restaurantFor(user) {
  const { data, error } = await supabaseCloudAdmin.from("profiles").select("id,role,restaurant_id").eq("id", user.id).maybeSingle()
  if (error) throw error
  if (!data?.restaurant_id && data?.role !== "super_admin") throw new Error("Restaurant mapping not found")
  return data
}

function statusFor(method) {
  return ["cash", "upi", "card"].includes(String(method || "").toLowerCase()) ? "matched" : "pending"
}

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const profile = await restaurantFor(user)
    const url = new URL(req.url)
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 365)
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const restaurantId = profile.restaurant_id
    if (!restaurantId) return NextResponse.json({ success: true, rows: [], summary: {} })

    const { data: rows, error } = await supabaseCloudAdmin
      .from("p0_payment_reconciliation")
      .select("id,order_id,provider,external_reference,expected_amount,received_amount,difference,status,metadata,matched_at,created_at,updated_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500)
    if (error) throw error

    const summary = (rows || []).reduce((a, r) => {
      const amount = Number(r.received_amount || 0)
      a.count += 1
      a.received += amount
      a.expected += Number(r.expected_amount || 0)
      a.byStatus[r.status] = (a.byStatus[r.status] || 0) + 1
      return a
    }, { count: 0, expected: 0, received: 0, byStatus: {} })

    return NextResponse.json({ success: true, rows: rows || [], summary, days })
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || "Unable to load payment reconciliation" }, { status: /authorized|access|login/i.test(e?.message || "") ? 403 : 500 })
  }
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const profile = await restaurantFor(user)
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || "sync").trim().toLowerCase()
    const restaurantId = profile.restaurant_id
    if (!restaurantId) throw new Error("Restaurant mapping not found")

    if (action === "sync") {
      const days = Math.min(Math.max(Number(body?.days || 30), 1), 365)
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const { data: payments, error } = await supabaseCloudAdmin
        .from("order_payments")
        .select("id,order_id,payment_method,amount,reference,status,paid_at,created_at")
        .eq("restaurant_id", restaurantId)
        .eq("status", "paid")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000)
      if (error) throw error

      let synced = 0
      for (const p of payments || []) {
        const provider = String(p.payment_method || "manual").toLowerCase() === "online" ? "online" : String(p.payment_method || "manual").toLowerCase()
        const externalReference = String(p.reference || `payment:${p.id}`).slice(0, 250)
        const { error: upsertError } = await supabaseCloudAdmin.from("p0_payment_reconciliation").upsert({
          restaurant_id: restaurantId,
          order_id: p.order_id,
          provider,
          external_reference: externalReference,
          expected_amount: Number(p.amount || 0),
          received_amount: Number(p.amount || 0),
          status: statusFor(p.payment_method),
          metadata: { payment_id: p.id, payment_method: p.payment_method, internal_sync: true },
          matched_at: statusFor(p.payment_method) === "matched" ? (p.paid_at || new Date().toISOString()) : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "restaurant_id,order_id,provider,external_reference" })
        if (!upsertError) synced += 1
      }
      return NextResponse.json({ success: true, action, synced })
    }

    if (action === "settle") {
      const id = String(body?.id || "").trim()
      if (!id) throw new Error("Reconciliation record is required")
      const received = Number(body?.received_amount)
      if (!Number.isFinite(received) || received < 0) throw new Error("Invalid received amount")
      const { data: row, error: rowError } = await supabaseCloudAdmin.from("p0_payment_reconciliation").select("*").eq("id", id).eq("restaurant_id", restaurantId).maybeSingle()
      if (rowError) throw rowError
      if (!row) throw new Error("Reconciliation record not found")
      const expected = Number(row.expected_amount || 0)
      const diff = received - expected
      const status = Math.abs(diff) < 0.005 ? "settled" : diff < 0 ? "short" : "over"
      const { data, error } = await supabaseCloudAdmin.from("p0_payment_reconciliation").update({
        received_amount: received,
        status,
        matched_at: new Date().toISOString(),
        matched_by: user.id,
        metadata: { ...(row.metadata || {}), settlement_note: String(body?.note || "").slice(0, 500) },
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("restaurant_id", restaurantId).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, action, row: data })
    }

    throw new Error("Unsupported reconciliation action")
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || "Unable to reconcile payment" }, { status: /authorized|access|login/i.test(e?.message || "") ? 403 : 400 })
  }
}
