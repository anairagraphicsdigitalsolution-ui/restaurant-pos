import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { verifyWhatsAppSignature } from "@/lib/whatsappServer"

export const runtime = "nodejs"

async function findRestaurant(phoneNumberId) {
  const { data, error } = await supabaseCloudAdmin
    .from("plugin_settings")
    .select("restaurant_id,config")
    .eq("plugin_code","whatsapp-invoice")
    .eq("config->>phone_number_id", String(phoneNumberId))
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get("hub.mode")
    const token = url.searchParams.get("hub.verify_token")
    const challenge = url.searchParams.get("hub.challenge")
    if (mode !== "subscribe" || !token) {
      return new NextResponse("Bad Request", {status:400})
    }

    const { data: rows, error } = await supabaseCloudAdmin
      .from("plugin_settings")
      .select("config")
      .eq("plugin_code","whatsapp-invoice")
    if (error) throw new Error(error.message)

    const match = (rows || []).some(row =>
      String(row.config?.webhook_verify_token || "") === String(token)
    )

    if (!match) return new NextResponse("Forbidden", {status:403})
    return new NextResponse(String(challenge || ""), {status:200})
  } catch (e) {
    return new NextResponse(e?.message || "Webhook verification failed", {status:500})
  }
}

export async function POST(req) {
  const raw = await req.text()
  try {
    const signature = req.headers.get("x-hub-signature-256") || ""
    let payload = {}
    try { payload = JSON.parse(raw) } catch {}

    const changes = []
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) changes.push(change)
    }

    for (const change of changes) {
      const value = change?.value || {}
      const metadata = value?.metadata || {}
      const phoneNumberId = metadata?.phone_number_id
      if (!phoneNumberId) continue

      const settings = await findRestaurant(phoneNumberId)
      if (!settings) continue

      const appSecret = settings.config?.webhook_app_secret
      const valid = await verifyWhatsAppSignature(raw, signature, appSecret)
      if (!valid) return NextResponse.json({success:false,error:"Invalid webhook signature"},{status:401})

      for (const message of value?.messages || []) {
        await supabaseCloudAdmin.from("whatsapp_messages").insert({
          restaurant_id: settings.restaurant_id,
          direction: "inbound",
          sender: message.from || null,
          recipient: metadata.display_phone_number || null,
          message_type: message.type || null,
          wamid: message.id || null,
          status: "received",
          body: message.text?.body || null,
          payload: message
        })
      }

      for (const status of value?.statuses || []) {
        await supabaseCloudAdmin.from("whatsapp_messages")
          .update({status: status.status || "unknown", updated_at:new Date().toISOString(), response:status})
          .eq("restaurant_id", settings.restaurant_id)
          .eq("wamid", status.id)
      }
    }

    return NextResponse.json({success:true})
  } catch (e) {
    console.error("WHATSAPP WEBHOOK ERROR", e)
    return NextResponse.json({success:false,error:e?.message || "Webhook failed"},{status:500})
  }
}
