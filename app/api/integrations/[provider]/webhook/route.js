import crypto from "crypto"
import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

export const runtime = "nodejs"

function timingSafe(expected, received) {
  const a = Buffer.from(String(received || ""))
  const b = Buffer.from(String(expected || ""))
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)
}

function verifyHmac(rawBody, signature, secret, algorithm = "sha256", prefix = "sha256=") {
  if (!secret) return { configured: false, valid: true }
  const digest = crypto.createHmac(algorithm, secret).update(rawBody).digest("hex")
  const expected = `${prefix}${digest}`
  return { configured: true, valid: timingSafe(expected, signature) }
}

function getWebhookConfig(credentials = {}) {
  return {
    secret: credentials.webhook_secret || credentials.webhook_app_secret || "",
    header: credentials.webhook_signature_header || "x-webhook-signature",
    algorithm: credentials.webhook_signature_algorithm || "sha256",
    prefix: credentials.webhook_signature_prefix ?? "sha256=",
  }
}

export async function POST(req,{params}){
  const provider=String(params?.provider||"").toLowerCase()
  if(!["zomato","swiggy"].includes(provider)) return NextResponse.json({success:false,error:"Unsupported provider"},{status:404})

  const raw = await req.text()
  try{
    const body=JSON.parse(raw)
    const outlet=String(body?.restaurant_id||body?.restaurant?.id||body?.outlet_id||body?.outlet?.id||body?.store_id||body?.store?.id||"")
    let query=supabaseCloudAdmin.from("aggregator_integrations").select("id,restaurant_id,credentials,outlet_code").eq("provider",provider).eq("active",true)
    if(outlet) query=query.eq("outlet_code",outlet)
    const {data:rows,error}=await query.limit(10)
    if(error) throw error
    if(!rows?.length) return NextResponse.json({success:false,error:"No active restaurant mapping for webhook"},{status:202})

    let integration = null
    for (const candidate of rows) {
      const cfg = getWebhookConfig(candidate.credentials || {})
      const receivedSignature = req.headers.get(cfg.header) || req.headers.get("x-hub-signature-256") || ""
      // Keep the plugin installable without credentials, but never accept a
      // production webhook until its signing secret has been configured.
      if (!cfg.secret) continue
      const check = verifyHmac(raw, receivedSignature, cfg.secret, cfg.algorithm, cfg.prefix)
      if (check.valid) { integration = candidate; break }
    }
    if (!integration) return NextResponse.json({success:false,error:"Invalid webhook signature"},{status:401})

    const externalOrderId=String(body?.order?.order_id||body?.order_id||body?.id||`${provider}-${Date.now()}`)
    const {error:orderError}=await supabaseCloudAdmin.from("aggregator_orders").upsert({
      restaurant_id:integration.restaurant_id,
      integration_id:integration.id,
      provider,
      external_order_id:externalOrderId,
      status:String(body?.status||body?.order?.status||"received"),
      payload:body,
      updated_at:new Date().toISOString()
    },{onConflict:"restaurant_id,provider,external_order_id"})
    if(orderError) throw orderError

    await supabaseCloudAdmin.from("aggregator_sync_jobs").insert({restaurant_id:integration.restaurant_id,provider,job_type:"webhook",status:"success",payload:body,finished_at:new Date().toISOString()})
    return NextResponse.json({success:true,received:true})
  }catch(e){
    console.error(`${provider} webhook`,e)
    return NextResponse.json({success:false,error:e.message||"Webhook processing failed"},{status:400})
  }
}
