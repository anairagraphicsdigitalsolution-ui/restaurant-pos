import crypto from "crypto"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { cashfreeRequest } from "@/lib/cashfree"
import { rateLimit, rateLimitResponse, rejectOversizedRequest } from "@/lib/publicRateLimit"
export const runtime="nodejs"
const hash=v=>crypto.createHash("sha256").update(String(v)).digest("hex")
function base64Safe(v){return Buffer.from(String(v)).toString("base64url")}
export async function POST(req){
 const oversized=rejectOversizedRequest(req);if(oversized)return oversized
 const limit=rateLimit(req,"public-qr-payment-create",20);if(!limit.ok)return rateLimitResponse(limit)
 try{
  const b=await req.json();const orderId=String(b.order_id||"").trim();const token=String(b.session_token||"").trim();const requestedMethod=String(b.method||"manual_qr").trim().toLowerCase();if(!orderId||!token)throw new Error("Payment session is required")
  const {data:s}=await supabaseCloudAdmin.from("qr_guest_sessions").select("id,restaurant_id,source_type,source_id").eq("token_hash",hash(token)).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)throw new Error("QR session expired")
  const {data:order}=await supabaseCloudAdmin.from("orders").select("id,restaurant_id,total_amount,paid_amount,payment_status,status,invoice_no,customer_name,customer_phone,source_label").eq("id",orderId).eq("restaurant_id",s.restaurant_id).eq("qr_session_id",s.id).maybeSingle();if(!order)throw new Error("Order not found")
  const amount=Math.max(0,Number(order.total_amount||0)-Number(order.paid_amount||0));if(amount<=0)return Response.json({success:true,already_paid:true,amount:0})
  const [{data:account},{data:cashPlugin},{data:cashSettings}]=await Promise.all([
   supabaseCloudAdmin.from("restaurant_payment_accounts").select("active,settings").eq("restaurant_id",order.restaurant_id).eq("provider","payment-accounts").order("updated_at",{ascending:false}).limit(1).maybeSingle(),
   supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id",order.restaurant_id).eq("plugin_code","cashfree-payment-gateway").maybeSingle(),
   supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id",order.restaurant_id).eq("plugin_code","cashfree-payment-gateway").maybeSingle()
  ])
  const merchant=account?.settings||{}; const cashfreeEnabled=cashPlugin?.enabled===true && cashSettings?.config?.enabled_for_restaurant!==false
  const useAuto=requestedMethod==="cashfree"||requestedMethod==="auto"
  if(useAuto){
   if(!cashfreeEnabled)throw new Error("Automatic online payment is not enabled for this restaurant")
   if(!String(order.customer_phone||"").replace(/\D/g,"").slice(-10)) throw new Error("Please enter your mobile number before automatic payment")
   const cfg=cashSettings?.config||{};const origin=new URL(req.url).origin;const requestedReturn=String(b.return_url||"").trim();const returnUrl=(requestedReturn.startsWith(origin+"/")?requestedReturn:origin+"/")+`?payment=return&order_id=${encodeURIComponent(order.id)}`;const notifyUrl=`${origin}/api/public/qr-payment/webhook?restaurant_id=${encodeURIComponent(order.restaurant_id)}`
   const cfOrderId=`AQ-${order.id.slice(0,12)}-${Date.now().toString(36)}`
   const payload={order_id:cfOrderId,order_amount:Number(amount.toFixed(2)),order_currency:"INR",customer_details:{customer_id:`qr_${base64Safe(s.id).slice(0,20)}`,customer_name:order.customer_name||"QR Customer",customer_phone:String(order.customer_phone||"9999999999").replace(/\D/g,"").slice(-10)},order_meta:{return_url:returnUrl,notify_url:notifyUrl},order_note:`Anaira QR payment ${order.id}`}
   const result=await cashfreeRequest("/orders",{config:cfg,method:"POST",body:payload,headers:{"x-idempotency-key":crypto.randomUUID()}})
   const {data:reqRow,error}=await supabaseCloudAdmin.from("qr_payment_requests").insert({restaurant_id:order.restaurant_id,order_id:order.id,session_id:s.id,amount,method:"cashfree",status:"processing",provider:"cashfree",provider_order_id:result.order_id||cfOrderId,payment_session_id:result.payment_session_id||null,expires_at:new Date(Date.now()+30*60*1000).toISOString(),metadata:{mode:"auto"}}).select("id").single();if(error)throw error
   return Response.json({success:true,mode:"auto",request_id:reqRow.id,amount,payment_session_id:result.payment_session_id,cashfree_order_id:result.order_id||cfOrderId,environment:cfg.environment||"sandbox"})
  }
  if(!account?.active || (!merchant.upi_id&&!merchant.manual_qr_image_url))throw new Error("Manual payment QR is not configured by the restaurant")
  const {data:reqRow,error}=await supabaseCloudAdmin.from("qr_payment_requests").insert({restaurant_id:order.restaurant_id,order_id:order.id,session_id:s.id,amount,method:"manual_qr",status:"pending",provider:"merchant_qr",expires_at:new Date(Date.now()+30*60*1000).toISOString(),metadata:{upi_id:merchant.upi_id||null,manual_qr_image_url:merchant.manual_qr_image_url||null,merchant_name:merchant.merchant_name||null}}).select("id").single();if(error)throw error
  const upi=merchant.upi_id?`upi://pay?pa=${encodeURIComponent(merchant.upi_id)}&pn=${encodeURIComponent(merchant.merchant_name||"Restaurant")}&am=${encodeURIComponent(amount.toFixed(2))}&cu=INR`:null
  return Response.json({success:true,mode:"manual",request_id:reqRow.id,amount,upi_uri:upi,qr_image_url:merchant.manual_qr_image_url||null,merchant_name:merchant.merchant_name||"Restaurant"})
 }catch(e){return Response.json({success:false,error:e.message||"Unable to start payment"},{status:400})}
}
