import {NextResponse} from "next/server"
import crypto from "node:crypto"
import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {getMetaServerConfig} from "@/lib/marketingConfig"
import {normalizeWhatsAppNumber} from "@/lib/whatsappServer"

export const runtime="nodejs"
const STOP_WORDS=new Set(["stop","unsubscribe","cancel","end","quit","remove","optout","opt-out"])

export async function GET(req){
  const u=new URL(req.url)
  const mode=u.searchParams.get("hub.mode")
  const token=u.searchParams.get("hub.verify_token")
  const challenge=u.searchParams.get("hub.challenge")
  const expected=process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN||""
  if(mode==="subscribe"&&token&&expected&&token===expected)return new Response(challenge,{status:200})
  return new Response("Forbidden",{status:403})
}

export async function POST(req){
  try{
    const raw=await req.text()
    const sig=req.headers.get("x-hub-signature-256")||""
    const cfg=await getMetaServerConfig()
    const secret=cfg.appSecret
    if(!secret)throw new Error("Meta App Secret is not configured")
    const expected="sha256="+crypto.createHmac("sha256",secret).update(raw).digest("hex")
    if(!sig||sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return new Response("Forbidden",{status:403})

    const body=JSON.parse(raw)
    for(const entry of body.entry||[]){
      for(const change of entry.changes||[]){
        const value=change.value||{}
        const phoneNumberId=String(value.metadata?.phone_number_id||"")

        for(const s of value.statuses||[]){
          const event={
            message_id:s.id||null,
            phone:s.recipient_id||null,
            status:s.status||"unknown",
            phone_number_id:phoneNumberId,
            metadata:{timestamp:s.timestamp,conversation:s.conversation,pricing:s.pricing,raw_event:"status"},
            idempotency_key:s.id?`status:${s.id}:${s.status||"unknown"}`:null,
          }
          await supabaseCloudAdmin.from("platform_marketing_message_events").upsert(event,{onConflict:"idempotency_key"})
          if(phoneNumberId){
            const {data:conn}=await supabaseCloudAdmin.from("marketing_connections").select("restaurant_id").eq("platform","whatsapp").eq("account_id",phoneNumberId).eq("status","connected").limit(1).maybeSingle()
            if(conn?.restaurant_id){
              await supabaseCloudAdmin.from("whatsapp_messages").update({status:s.status||"unknown",updated_at:new Date().toISOString()}).eq("restaurant_id",conn.restaurant_id).eq("wamid",s.id)
            }
          }
        }

        for(const m of value.messages||[]){
          const from=normalizeWhatsAppNumber(m.from||"")
          const messageId=String(m.id||"")
          if(!phoneNumberId||!from||!messageId)continue
          const {data:conn}=await supabaseCloudAdmin.from("marketing_connections").select("restaurant_id").eq("platform","whatsapp").eq("account_id",phoneNumberId).eq("status","connected").limit(1).maybeSingle()
          if(!conn?.restaurant_id)continue
          const text=String(m.text?.body||m.button?.text||m.interactive?.button_reply?.title||m.interactive?.list_reply?.title||"").trim()
          await supabaseCloudAdmin.from("whatsapp_messages").upsert({
            restaurant_id:conn.restaurant_id,
            direction:"inbound",
            sender:from,
            recipient:phoneNumberId,
            message_type:m.type||"unknown",
            wamid:messageId,
            status:"received",
            body:text||null,
            payload:m,
            response:null,
          },{onConflict:"wamid"})
          if(text&&STOP_WORDS.has(text.toLowerCase().replace(/\s+/g,""))){
            await supabaseCloudAdmin.from("marketing_audience_members").update({consent:false,unsubscribed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("restaurant_id",conn.restaurant_id).eq("channel","whatsapp").eq("address",from)
          }
        }
      }
    }

    return NextResponse.json({success:true})
  }catch(e){
    return NextResponse.json({success:false,error:e.message},{status:400})
  }
}
