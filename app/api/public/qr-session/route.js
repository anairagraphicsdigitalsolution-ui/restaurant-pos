import crypto from "crypto"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { rateLimit, rateLimitResponse, rejectOversizedRequest } from "@/lib/publicRateLimit"

export const runtime="nodejs"
function clean(v,max=120){const s=typeof v==="string"?v.trim():"";return s?s.slice(0,max):""}
function hash(v){return crypto.createHash("sha256").update(v).digest("hex")}
export async function POST(req){
  const oversized=rejectOversizedRequest(req); if(oversized)return oversized
  const limit=rateLimit(req,"public-qr-session",30); if(!limit.ok)return rateLimitResponse(limit)
  try{
    const b=await req.json(); const slug=clean(b.slug); const type=clean(b.type,20).toLowerCase(); const sourceId=clean(b.source_id,80); const orderId=clean(b.order_id,80)
    if(!slug||!['table','room'].includes(type)||!sourceId) return Response.json({success:false,error:"Invalid QR session"},{status:400})
    const {data:restaurant}=await supabaseCloudAdmin.from("restaurants").select("id,status").eq("slug",slug).maybeSingle()
    if(!restaurant || String(restaurant.status || "active").trim().toLowerCase() !== "active") throw new Error("Restaurant is not active")
    // Resolve QR sources without mixing UUID and numeric columns in one
    // PostgREST filter. A mixed OR can fail when one side receives a value
    // that cannot be cast to the other column type (for example a UUID being
    // compared with an integer table_number).
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId)
    let source = null

    if (type === "table") {
      if (isUuid) {
        const { data } = await supabaseCloudAdmin
          .from("tables")
          .select("id")
          .eq("restaurant_id", restaurant.id)
          .eq("id", sourceId)
          .maybeSingle()
        source = data
      } else {
        const { data } = await supabaseCloudAdmin
          .from("tables")
          .select("id")
          .eq("restaurant_id", restaurant.id)
          .eq("table_number", sourceId)
          .limit(1)
          .maybeSingle()
        source = data
      }
    } else {
      if (isUuid) {
        const { data } = await supabaseCloudAdmin
          .from("rooms")
          .select("id")
          .eq("restaurant_id", restaurant.id)
          .eq("id", sourceId)
          .maybeSingle()
        source = data
      } else {
        const { data } = await supabaseCloudAdmin
          .from("rooms")
          .select("id")
          .eq("restaurant_id", restaurant.id)
          .eq("room_number", sourceId)
          .limit(1)
          .maybeSingle()
        source = data
      }
    }

    if(!source?.id) throw new Error("QR source not found")
    const token=crypto.randomBytes(32).toString("base64url")
    const tokenHash=hash(token)
    const {data:session,error}=await supabaseCloudAdmin.from("qr_guest_sessions").insert({restaurant_id:restaurant.id,source_type:type,source_id:source.id,token_hash:tokenHash,expires_at:new Date(Date.now()+24*60*60*1000).toISOString()}).select("id,expires_at").single()
    if(error)throw error
    if(orderId) {
      await supabaseCloudAdmin.from("orders").update({ qr_session_id: session.id }).eq("id", orderId).eq("restaurant_id", restaurant.id).eq("source_type", type).eq("source_id", String(source.id))
    }
    return Response.json({success:true,session_token:token,session_id:session.id,expires_at:session.expires_at})
  }catch(e){return Response.json({success:false,error:e.message||"Unable to start QR session"},{status:400})}
}
