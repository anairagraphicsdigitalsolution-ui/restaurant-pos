import { requireFeature } from "@/lib/featureGateServer"
import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { callProvider, normalizeAggregatorAction } from "@/lib/aggregatorAdapter"

export const runtime = "nodejs"
const PROVIDERS = new Set(["swiggy", "zomato"])

async function ctx(req) {
  const user = await requireApiUser(req)
  const r = await resolveRestaurantForUser(user)
  if (!r.restaurantId) throw new Error("Restaurant profile not found")
  await requireFeature(r.restaurantId, "restaurant-pro")
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
      const providerAction = normalizeAggregatorAction(body.provider_action)
      if (!externalOrderId) throw new Error("External order ID is required")
      const { data: integration, error } = await supabaseCloudAdmin
        .from("aggregator_integrations")
        .select("id,restaurant_id,provider,outlet_code,credentials")
        .eq("restaurant_id", restaurantId).eq("provider", provider).eq("active", true).maybeSingle()
      if (error) throw error
      if (!integration) throw new Error(`${provider} integration is not configured`)

      const requestId = String(body.idempotency_key || `${provider}:${externalOrderId}:${providerAction}`)
      const { data: queued, error: queueError } = await supabaseCloudAdmin.rpc("p0_h1_queue_aggregator_action", {
        p_restaurant_id: restaurantId,
        p_provider: provider,
        p_action: providerAction,
        p_idempotency_key: requestId,
        p_integration_id: integration.id,
        p_aggregator_order_id: body.aggregator_order_id || null,
        p_external_order_id: externalOrderId,
        p_payload: body.payload || {}
      })
      if (queueError) throw queueError

      const { data: existingAction } = await supabaseCloudAdmin.from("aggregator_provider_actions").select("id,status,response_payload,attempts").eq("id", queued.action_id).maybeSingle()
      if (existingAction?.status === "succeeded") return NextResponse.json({ success: true, replayed: true, action_id: existingAction.id, result: existingAction.response_payload })

      await supabaseCloudAdmin.from("aggregator_provider_actions").update({ status: "processing", attempts: Number(existingAction?.attempts || 0) + 1, updated_at: new Date().toISOString() }).eq("id", queued.action_id)
      const result = await callProvider({ integration, action: providerAction, payload: { order_id: externalOrderId, ...(body.payload || {}) } })
      const stamp = new Date().toISOString()
      if (!result.ok) {
        await supabaseCloudAdmin.from("aggregator_provider_actions").update({ status: "failed", response_payload: result.data || {}, error_message: `Provider HTTP ${result.status}`, updated_at: stamp }).eq("id", queued.action_id)
        await supabaseCloudAdmin.from("aggregator_orders").update({ last_error: `Provider HTTP ${result.status}`, updated_at: stamp }).eq("restaurant_id", restaurantId).eq("provider", provider).eq("external_order_id", externalOrderId)
        return NextResponse.json({ success: false, error: `Provider returned HTTP ${result.status}`, action_id: queued.action_id, result: result.data }, { status: 502 })
      }
      await supabaseCloudAdmin.from("aggregator_provider_actions").update({ status: "succeeded", response_payload: result.data || {}, error_message: null, completed_at: stamp, updated_at: stamp }).eq("id", queued.action_id)
      await supabaseCloudAdmin.rpc("p0_h1_update_aggregator_order_status", { p_restaurant_id: restaurantId, p_aggregator_order_id: body.aggregator_order_id, p_status: providerAction === "accept" ? "accepted" : providerAction === "ready" ? "ready" : providerAction === "picked_up" ? "picked_up" : providerAction === "reject" ? "rejected" : providerAction === "cancel" ? "cancelled" : "preparing", p_provider_status: String(body.provider_status || ""), p_reason: body.reason || null }).catch(() => null)
      return NextResponse.json({ success: true, provider, action: providerAction, action_id: queued.action_id, result: result.data })
    }

    if (action === "retry_failed") {
      const workerId = `api:${restaurantId}:${Date.now()}`
      const { data: claimed, error: claimError } = await supabaseCloudAdmin.rpc("p0_h1b_claim_aggregator_action", { p_worker_id: workerId, p_limit: 10 })
      if (claimError) throw claimError
      const results = []
      for (const item of claimed || []) {
        try {
          const { data: integration, error: integrationError } = await supabaseCloudAdmin
            .from("aggregator_integrations")
            .select("id,restaurant_id,provider,outlet_code,credentials")
            .eq("id", item.integration_id).eq("restaurant_id", restaurantId).eq("active", true).maybeSingle()
          if (integrationError) throw integrationError
          if (!integration) throw new Error("Aggregator integration is not active")
          const result = await callProvider({ integration, action: item.action, payload: { order_id: item.external_order_id, ...(item.request_payload || {}) } })
          const stamp = new Date().toISOString()
          if (!result.ok) throw new Error(`Provider HTTP ${result.status}`)
          await supabaseCloudAdmin.from("aggregator_provider_actions").update({ status:"succeeded", response_payload:result.data||{}, error_message:null, completed_at:stamp, claimed_at:null, claimed_by:null, next_retry_at:null, updated_at:stamp }).eq("id",item.id)
          results.push({ id:item.id,status:"succeeded" })
        } catch (e) {
          const { data: failure } = await supabaseCloudAdmin.rpc("p0_h1b_record_aggregator_action_failure", { p_action_id:item.id, p_error:e?.message||"Retry failed", p_retry:true })
          results.push({ id:item.id,status:failure?.status||"failed",error:e?.message||"Retry failed",next_retry_at:failure?.next_retry_at||null })
        }
      }
      const { data: menuJobs, error: menuClaimError } = await supabaseCloudAdmin.rpc("p0_h1b_claim_menu_sync", { p_worker_id: workerId, p_limit: 5 })
      if (menuClaimError) throw menuClaimError
      for (const job of menuJobs || []) {
        try {
          const { data: integration, error: integrationError } = await supabaseCloudAdmin
            .from("aggregator_integrations")
            .select("id,restaurant_id,provider,outlet_code,credentials")
            .eq("id", job.integration_id).eq("restaurant_id", restaurantId).eq("active", true).maybeSingle()
          if (integrationError) throw integrationError
          if (!integration) throw new Error("Aggregator integration is not active")
          const providerAction = job.sync_type === "availability" ? "sync_availability" : "sync_menu"
          const result = await callProvider({ integration, action: providerAction, payload: { request_id:`retry:${job.id}:${job.attempts}`, version:job.requested_version || null, ...(job.payload || {}) } })
          if (!result.ok) throw new Error(`Provider HTTP ${result.status}`)
          await supabaseCloudAdmin.from("aggregator_menu_sync_jobs").update({ status:"succeeded", payload:result.data||{}, error_message:null, finished_at:new Date().toISOString(), claimed_at:null, claimed_by:null, next_retry_at:null }).eq("id",job.id)
          results.push({ id:job.id,status:"succeeded",type:"menu_sync" })
        } catch (e) {
          const attempts=Number(job.attempts||1)
          const terminal=attempts>=Number(job.max_attempts||5)
          const delay=Math.min(1800,Math.max(15,15*Math.pow(2,Math.max(attempts-1,0))))
          await supabaseCloudAdmin.from("aggregator_menu_sync_jobs").update({ status:"failed",error_message:String(e?.message||"Retry failed").slice(0,2000),next_retry_at:terminal?null:new Date(Date.now()+delay*1000).toISOString(),dead_lettered_at:terminal?new Date().toISOString():null,claimed_at:null,claimed_by:null }).eq("id",job.id)
          results.push({ id:job.id,status:terminal?"dead_lettered":"failed",type:"menu_sync",error:e?.message||"Retry failed" })
        }
      }
      return NextResponse.json({ success:true,claimed:(claimed||[]).length,menu_claimed:(menuJobs||[]).length,results })
    }

    if (action === "sync_menu" || action === "sync_availability") {
      const { data: integration, error } = await supabaseCloudAdmin.from("aggregator_integrations").select("id,restaurant_id,provider,outlet_code,credentials").eq("restaurant_id", restaurantId).eq("provider", provider).eq("active", true).maybeSingle()
      if (error) throw error
      if (!integration) throw new Error(`${provider} integration is not configured`)
      const syncType = action === "sync_menu" ? "full" : "availability"
      const requestId = String(body.idempotency_key || `${provider}:${syncType}:${body.version || "current"}`)
      const { data: job, error: jobError } = await supabaseCloudAdmin.from("aggregator_menu_sync_jobs").insert({ restaurant_id: restaurantId, integration_id: integration.id, provider, sync_type: syncType, status: "running", requested_version: body.version || null, payload: body.payload || {} }).select("id").single()
      if (jobError) throw jobError
      try {
        const result = await callProvider({ integration, action: syncType === "full" ? "sync_menu" : "sync_availability", payload: { request_id: requestId, version: body.version || null, ...(body.payload || {}) } })
        if (!result.ok) throw new Error(`Provider HTTP ${result.status}`)
        await supabaseCloudAdmin.from("aggregator_menu_sync_jobs").update({ status: "succeeded", payload: result.data || {}, finished_at: new Date().toISOString() }).eq("id", job.id)
        return NextResponse.json({ success: true, job_id: job.id, result: result.data })
      } catch (e) {
        await supabaseCloudAdmin.from("aggregator_menu_sync_jobs").update({ status: "failed", error_message: e.message, finished_at: new Date().toISOString() }).eq("id", job.id)
        throw e
      }
    }

    throw new Error("Unknown aggregator action")
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message || "Aggregator operation failed" }, { status: 400 })
  }
}
