import crypto from "crypto"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { rateLimit, rateLimitResponse, rejectOversizedRequest } from "@/lib/publicRateLimit"
import { cashfreeRequest } from "@/lib/cashfree"
export const runtime="nodejs"
const hash=v=>crypto.createHash("sha256").update(String(v)).digest("hex")
const token=()=>crypto.randomBytes(32).toString("base64url")

async function kiosk(code){
 const {data,error}=await supabaseCloudAdmin.from("p2_3_kiosks").select("id,restaurant_id,kiosk_code,name,status,version,menu_version,config,branding,payment_config,token_config").eq("kiosk_code",code).in("status",["active","offline"]).maybeSingle()
 if(error)throw error; if(!data)throw new Error("Kiosk not found or inactive")
 return data
}

export async function GET(req){
 const limit=rateLimit(req,"p2-3-kiosk-menu",60); if(!limit.ok)return rateLimitResponse(limit)
 try{
  const code=String(new URL(req.url).searchParams.get("kiosk_code")||"").trim(); if(!code)throw new Error("kiosk_code is required")
  const k=await kiosk(code)
  const {data:menu,error}=await supabaseCloudAdmin.from("menu_items").select("id,name,price,category,image,description,item_type,combo_config,menu_variants(id,name,price_delta,active)").eq("restaurant_id",k.restaurant_id).order("category").order("name")
  if(error)throw error
  const [{data:groups},{data:mods},{data:links},{data:upsells},{data:restaurant}]=await Promise.all([
   supabaseCloudAdmin.from("modifier_groups").select("id,name,selection_type,required,min_select,max_select").eq("restaurant_id",k.restaurant_id).eq("active",true),
   supabaseCloudAdmin.from("modifiers").select("id,group_id,name,price,active").eq("restaurant_id",k.restaurant_id).eq("active",true),
   supabaseCloudAdmin.from("menu_item_modifier_groups").select("menu_item_id,modifier_group_id").eq("restaurant_id",k.restaurant_id),
   supabaseCloudAdmin.from("p2_3_kiosk_upsells").select("source_menu_item_id,suggested_menu_item_id,priority").eq("restaurant_id",k.restaurant_id).eq("active",true).order("priority"),
   supabaseCloudAdmin.from("restaurants").select("name,default_tax_percent").eq("id",k.restaurant_id).maybeSingle()
  ])
  return Response.json({success:true,kiosk:k,restaurant,menu:menu||[],modifier_groups:groups||[],modifiers:mods||[],modifier_links:links||[],upsells:upsells||[]})
 }catch(e){return Response.json({success:false,error:e.message||"Unable to load kiosk"},{status:400})}
}

export async function POST(req){
 const oversized=rejectOversizedRequest(req);if(oversized)return oversized
 const limit=rateLimit(req,"p2-3-kiosk-order",15);if(!limit.ok)return rateLimitResponse(limit)
 try{
  const b=await req.json(); const code=String(b?.kiosk_code||"").trim(); if(!code)throw new Error("kiosk_code is required")
  const k=await kiosk(code); const clientRequestId=String(b?.client_request_id||crypto.randomUUID()).slice(0,120)
  const payload={...(b?.payload||{}),kiosk_name:k.name}
  const {data:result,error}=await supabaseCloudAdmin.rpc("p2_3_finalize_kiosk_order",{p_restaurant_id:k.restaurant_id,p_kiosk_id:k.id,p_session_id:b?.session_id||null,p_client_request_id:clientRequestId,p_payload:payload,p_payment_method:String(b?.payment_method||"cash")})
  if(error)throw error
  const orderId=result?.order_id
  if(!orderId)return Response.json(result)
  const paymentMethod=String(b?.payment_method||"cash")
  if(paymentMethod==="cash") return Response.json({...result,payment:{mode:"cash",status:"cash_due"}})

  const sessionToken=token(); const {data:session,error:sessionError}=await supabaseCloudAdmin.from("qr_guest_sessions").insert({restaurant_id:k.restaurant_id,source_type:"kiosk",source_id:k.id,token_hash:hash(sessionToken),expires_at:new Date(Date.now()+30*60*1000).toISOString()}).select("id").single()
  if(sessionError)throw sessionError
  await supabaseCloudAdmin.from("orders").update({qr_session_id:session.id,qr_client_request_id:clientRequestId}).eq("id",orderId).eq("restaurant_id",k.restaurant_id)
  const [{data:account},{data:plugin},{data:settings}]=await Promise.all([
   supabaseCloudAdmin.from("restaurant_payment_accounts").select("active,settings").eq("restaurant_id",k.restaurant_id).eq("provider","payment-accounts").order("updated_at",{ascending:false}).limit(1).maybeSingle(),
   supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id",k.restaurant_id).eq("plugin_code","cashfree-payment-gateway").maybeSingle(),
   supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id",k.restaurant_id).eq("plugin_code","cashfree-payment-gateway").maybeSingle()
  ])
  const merchant=account?.settings||{}; const auto=plugin?.enabled===true&&settings?.config?.enabled_for_restaurant!==false&&account?.active===true&&merchant.auto_payment_detection===true
  if(auto && (paymentMethod==="upi"||paymentMethod==="card")){
   const phone=String(payload.customer_phone||"").replace(/\D/g,"").slice(-10); if(phone.length!==10)throw new Error("10-digit mobile number is required for online payment")
   const origin=new URL(req.url).origin; const cfId=`KSK-${orderId.slice(0,12)}-${Date.now().toString(36)}`
   const cf=await cashfreeRequest("/orders",{config:settings?.config||{},method:"POST",body:{order_id:cfId,order_amount:Number(result.total||0),order_currency:"INR",customer_details:{customer_id:`kiosk_${k.id.slice(0,12)}`,customer_name:payload.customer_name||"Kiosk Customer",customer_phone:phone},order_meta:{return_url:`${origin}/kiosk/${encodeURIComponent(code)}?payment=return&order_id=${encodeURIComponent(orderId)}`,notify_url:`${origin}/api/public/qr-payment/webhook?restaurant_id=${encodeURIComponent(k.restaurant_id)}`}},headers:{"x-idempotency-key":clientRequestId}})
   await supabaseCloudAdmin.from("qr_payment_requests").insert({restaurant_id:k.restaurant_id,order_id:orderId,session_id:session.id,amount:Number(result.total||0),method:"cashfree",status:"processing",provider:"cashfree",provider_order_id:cf.order_id||cfId,payment_session_id:cf.payment_session_id||null,expires_at:new Date(Date.now()+30*60*1000).toISOString(),metadata:{source:"p2_3_kiosk",kiosk_id:k.id}})
   return Response.json({...result,payment:{mode:"cashfree",status:"processing",payment_session_id:cf.payment_session_id,cashfree_order_id:cf.order_id||cfId,environment:settings?.config?.environment||"sandbox",session_token:sessionToken}})
  }
  if(paymentMethod!=="upi")throw new Error("Card payment requires an enabled Cashfree/card terminal configuration")
  if(!account?.active||(!merchant.upi_id&&!merchant.manual_qr_image_url))throw new Error("Merchant UPI/QR payment is not configured")
  const {data:qr,error:qrError}=await supabaseCloudAdmin.from("qr_payment_requests").insert({restaurant_id:k.restaurant_id,order_id:orderId,session_id:session.id,amount:Number(result.total||0),method:"manual_qr",status:"pending",provider:"merchant_qr",expires_at:new Date(Date.now()+30*60*1000).toISOString(),metadata:{mode:"p2_3_kiosk",upi_id:merchant.upi_id||null,manual_qr_image_url:merchant.manual_qr_image_url||null,merchant_name:merchant.merchant_name||k.name}}).select("id").single()
  if(qrError)throw qrError
  const upi=merchant.upi_id?`upi://pay?pa=${encodeURIComponent(merchant.upi_id)}&pn=${encodeURIComponent(merchant.merchant_name||k.name)}&am=${encodeURIComponent(Number(result.total||0).toFixed(2))}&cu=INR`:null
  return Response.json({...result,payment:{mode:"manual_qr",status:"pending",request_id:qr.id,upi_uri:upi,qr_image_url:merchant.manual_qr_image_url||null,merchant_name:merchant.merchant_name||k.name,session_token:sessionToken}})
 }catch(e){return Response.json({success:false,error:e.message||"Kiosk order failed"},{status:400})}
}
