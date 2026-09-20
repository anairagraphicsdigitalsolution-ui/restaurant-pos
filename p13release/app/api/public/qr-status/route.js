import crypto from "crypto"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { rateLimit, rateLimitResponse } from "@/lib/publicRateLimit"
export const runtime="nodejs"
const hash=v=>crypto.createHash("sha256").update(String(v)).digest("hex")
export async function GET(req){
 const limit=rateLimit(req,"public-qr-status",120);if(!limit.ok)return rateLimitResponse(limit)
 try{const q=new URL(req.url).searchParams;const token=String(q.get("token")||"").trim();const orderId=String(q.get("order_id")||"").trim();if(!token||!orderId)throw new Error("Order tracking details are required")
  const {data:s}=await supabaseCloudAdmin.from("qr_guest_sessions").select("id,restaurant_id,source_type,source_id,expires_at").eq("token_hash",hash(token)).maybeSingle();if(!s)throw new Error("Order session expired. Please scan the QR again.")
  const {data:o}=await supabaseCloudAdmin.from("orders").select("id,restaurant_id,status,payment_status,total_amount,paid_amount,invoice_no,source_type,source_label,customer_name,customer_phone,created_at,updated_at").eq("id",orderId).eq("restaurant_id",s.restaurant_id).eq("qr_session_id",s.id).maybeSingle();if(!o)throw new Error("Order not found for this QR session")
  const [{data:history},{data:items}]=await Promise.all([
    supabaseCloudAdmin.from("order_status_history").select("status,source,note,created_at").eq("order_id",o.id).order("created_at",{ascending:true}),
    supabaseCloudAdmin.from("order_items").select("id,item_name,quantity,unit_price,line_total,variant_name").eq("order_id",o.id).order("id")
  ])
  const {data:payments}=await supabaseCloudAdmin.from("qr_payment_requests").select("id,amount,method,status,reference,provider,created_at,paid_at").eq("order_id",o.id).order("created_at",{ascending:false}).limit(5)
  const now=new Date().toISOString()
  const extendSession = o.payment_status !== "paid" && !["cancelled","void","voided","refunded"].includes(String(o.status||"").toLowerCase())
  await supabaseCloudAdmin.from("qr_guest_sessions").update({last_seen_at:now, ...(extendSession ? {expires_at:new Date(Date.now()+7*24*60*60*1000).toISOString()} : {})}).eq("id",s.id)
  const {data:r}=await supabaseCloudAdmin.from("restaurants").select("slug,name").eq("id",s.restaurant_id).maybeSingle()
  return Response.json({success:true,order:o,items:items||[],history:history||[],payments:payments||[],session:{source_type:s.source_type,source_id:s.source_id,expires_at:extendSession ? new Date(Date.now()+7*24*60*60*1000).toISOString() : s.expires_at},restaurant:r||null})
 }catch(e){return Response.json({success:false,error:e.message||"Unable to load order status"},{status:400})}
}
