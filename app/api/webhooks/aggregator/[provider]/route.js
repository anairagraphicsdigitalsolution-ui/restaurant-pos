import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { verifyAggregatorWebhook } from "@/lib/aggregatorWebhook"
import { rateLimit, rateLimitResponse, rejectOversizedRequest } from "@/lib/publicRateLimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PROVIDERS = new Set(["swiggy", "zomato"])

function providerOf(value) {
  const p = String(value || "").toLowerCase()
  if (!PROVIDERS.has(p)) throw new Error("Unsupported aggregator")
  return p
}

function extract(body) {
  const order = body?.order || body?.data?.order || body?.data || body || {}
  const externalOrderId = String(body?.external_order_id || body?.order_id || order?.order_id || order?.id || "")
  const outletCode = String(body?.outlet_code || body?.outlet_id || order?.outlet_code || order?.outlet_id || body?.data?.outlet_code || "")
  const eventId = String(body?.event_id || body?.id || body?.event?.id || `${externalOrderId}:${body?.event_type || body?.type || "order"}`)
  const eventType = String(body?.event_type || body?.type || body?.event?.type || "order")
  return { externalOrderId, outletCode, eventId, eventType }
}

export async function POST(req, { params }) {
  const oversized = rejectOversizedRequest(req, 512 * 1024)
  if (oversized) return oversized
  const limit = rateLimit(req, "aggregator-webhook", 60)
  if (!limit.ok) return rateLimitResponse(limit)
  try {
    const provider = providerOf((await params).provider)
    const rawBody = await req.text()
    let body
    try { body = JSON.parse(rawBody) } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }) }
    const { externalOrderId, outletCode, eventId, eventType } = extract(body)
    if (!externalOrderId) return NextResponse.json({ success: false, error: "External order ID is required" }, { status: 400 })
    if (!outletCode) return NextResponse.json({ success: false, error: "Outlet code is required" }, { status: 400 })

    const { data: integration, error: integrationError } = await supabaseCloudAdmin
      .from("aggregator_integrations")
      .select("id,restaurant_id,provider,outlet_code,active,credentials")
      .eq("provider", provider).eq("outlet_code", outletCode).eq("active", true).maybeSingle()
    if (integrationError) throw integrationError
    if (!integration) return NextResponse.json({ success: false, error: "Aggregator integration not found" }, { status: 404 })

    const verification = verifyAggregatorWebhook({ provider, rawBody, headers: req.headers, credentials: integration.credentials || {} })
    if (!verification.ok) return NextResponse.json({ success: false, error: verification.error }, { status: verification.status })

    const { data: event, error: eventError } = await supabaseCloudAdmin.from("p0_aggregator_events").upsert({
      restaurant_id: integration.restaurant_id,
      provider,
      external_event_id: eventId,
      event_type: eventType,
      external_order_id: externalOrderId,
      payload: body,
      status: "received",
      idempotency_key: eventId,
      updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,provider,external_event_id" }).select("id,processed_order_id,status").single()
    if (eventError) throw eventError
    if (event.processed_order_id) return NextResponse.json({ success: true, duplicate: true, order_id: event.processed_order_id })

    const { data, error } = await supabaseCloudAdmin.rpc("p0_4_process_aggregator_order", {
      p_event_id: event.id,
      p_restaurant_id: integration.restaurant_id,
      p_provider: provider,
      p_external_order_id: externalOrderId,
      p_payload: body
    })
    if (error) throw error
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Webhook processing failed" }, { status: 400 })
  }
}
