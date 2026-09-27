import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

export const runtime = "nodejs"
const PROVIDERS = new Set(["swiggy", "zomato"])

async function ctx(req) {
  const user = await requireApiUser(req)
  const r = await resolveRestaurantForUser(user)
  if (!r.restaurantId) throw new Error("Restaurant profile not found")
  return { user, restaurantId: r.restaurantId }
}

function providerOf(v) {
  const p = String(v || "").toLowerCase()
  if (!PROVIDERS.has(p)) throw new Error("Unsupported aggregator")
  return p
}

function normalizePayload(body) {
  const o = body?.order || body || {}
  const items = Array.isArray(o.items) ? o.items : Array.isArray(body?.items) ? body.items : []
  return {
    ...body,
    status: body?.status || o.status || "received",
    external_order_id: String(body?.external_order_id || o.order_id || o.id || body?.order_id || body?.id || ""),
    total: body?.total ?? o.total ?? body?.order?.amount ?? 0,
    subtotal: body?.subtotal ?? o.subtotal ?? body?.total ?? o.total ?? 0,
    customer_name: body?.customer_name || o.customer_name || o.customer?.name || body?.customer?.name || "",
    customer_phone: body?.customer_phone || o.customer_phone || o.customer?.phone || body?.customer?.phone || "",
    delivery_address: body?.delivery_address || o.delivery_address || o.customer?.address || body?.customer?.address || "",
    payment_method: body?.payment_method || o.payment_method || "online",
    note: body?.note || o.note || "",
    items
  }
}

export async function GET(req) {
  try {
    const { restaurantId } = await ctx(req)
    const { searchParams } = new URL(req.url)
    const provider = searchParams.get("provider")
    let q = supabaseCloudAdmin.from("aggregator_orders").select("id,provider,external_order_id,order_id,status,commission,platform_discount,net_payout,received_at,updated_at,last_error").eq("restaurant_id", restaurantId).order("received_at", { ascending: false }).limit(100)
    if (provider) q = q.eq("provider", providerOf(provider))
    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ success: true, orders: data || [] })
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 })
  }
}

export async function POST(req) {
  try {
    const { restaurantId } = await ctx(req)
    const body = await req.json()
    const action = String(body?.action || "").toLowerCase()
    const provider = providerOf(body?.provider)

    if (action === "ingest") {
      const payload = normalizePayload(body.payload || body)
      if (!payload.external_order_id) throw new Error("External order ID is required")
      const eventKey = String(body.event_id || body.idempotency_key || `${provider}:${payload.external_order_id}:${payload.status}`)
      const { data: ev, error: evErr } = await supabaseCloudAdmin.from("p0_aggregator_events").upsert({
        restaurant_id: restaurantId, provider, external_event_id: eventKey, event_type: String(body.event_type || "order"), external_order_id: payload.external_order_id, payload, status: "received", idempotency_key: eventKey, updated_at: new Date().toISOString()
      }, { onConflict: "restaurant_id,provider,external_event_id" }).select("id,status,processed_order_id").single()
      if (evErr) throw evErr
      if (ev.processed_order_id) return NextResponse.json({ success: true, duplicate: true, order_id: ev.processed_order_id })
      const { data, error } = await supabaseCloudAdmin.rpc("p0_4_process_aggregator_order", { p_event_id: ev.id, p_restaurant_id: restaurantId, p_provider: provider, p_external_order_id: payload.external_order_id, p_payload: payload })
      if (error) throw error
      return NextResponse.json(data)
    }

    if (action === "map_item") {
      const externalItemId = String(body.external_item_id || "").trim()
      if (!externalItemId) throw new Error("External item ID is required")
      const { data, error } = await supabaseCloudAdmin.from("aggregator_item_mappings").upsert({ restaurant_id: restaurantId, provider, external_item_id: externalItemId, external_item_name: body.external_item_name || null, menu_item_id: body.menu_item_id || null, active: body.active !== false, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id,provider,external_item_id" }).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, mapping: data })
    }

    if (action === "provider_action") {
      const externalOrderId = String(body.external_order_id || "").trim()
      const allowed = new Set(["accept", "reject", "ready", "pickedup"])
      if (!allowed.has(String(body.provider_action))) throw new Error("Unsupported provider action")
      const { data: integration, error } = await supabaseCloudAdmin.from("aggregator_integrations").select("id,credentials,outlet_code").eq("restaurant_id", restaurantId).eq("provider", provider).eq("active", true).maybeSingle()
      if (error) throw error
      if (!integration) throw new Error(`${provider} integration is not configured`)
      const c = integration.credentials || {}
      const base = String(c.base_url || "").replace(/\/+$/, "")
      if (!base) throw new Error(`${provider} base URL is not configured`)
      const paths = provider === "zomato" ? { accept: "/online-ordering/v1/order/confirm", reject: "/online-ordering/v1/order/reject", ready: "/online-ordering/v1/order/ready", pickedup: "/online-ordering/v1/order/pickedup" } : {}
      const path = body.path || paths[body.provider_action]
      if (!path) throw new Error(`No configured ${provider} endpoint for ${body.provider_action}`)
      const url = path.startsWith("http") ? path : `${base}${path}`
      const headers = { "Content-Type": "application/json" }
      if (c.api_key) headers.Authorization = `Bearer ${c.api_key}`
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ outlet_id: integration.outlet_code, order_id: externalOrderId, ...(body.payload || {}) }) })
      const text = await response.text(); let result = text; try { result = JSON.parse(text) } catch {}
      if (!response.ok) throw new Error(`${provider} API ${response.status}: ${typeof result === "string" ? result : JSON.stringify(result)}`)
      const stamp = new Date().toISOString()
      const patch = { updated_at: stamp }
      if (body.provider_action === "accept") patch.accepted_at = stamp
      if (body.provider_action === "reject") patch.rejected_at = stamp
      if (body.provider_action === "ready") patch.ready_at = stamp
      if (body.provider_action === "pickedup") patch.picked_up_at = stamp
      await supabaseCloudAdmin.from("aggregator_orders").update(patch).eq("restaurant_id", restaurantId).eq("provider", provider).eq("external_order_id", externalOrderId)
      return NextResponse.json({ success: true, provider, action: body.provider_action, result })
    }

    throw new Error("Unknown aggregator action")
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message || "Aggregator operation failed" }, { status: 400 })
  }
}
