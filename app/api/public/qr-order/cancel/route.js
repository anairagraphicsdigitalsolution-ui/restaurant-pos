import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { rateLimit, rateLimitResponse } from "@/lib/publicRateLimit"
export const runtime = "nodejs"
export async function POST(req){
 const limit=rateLimit(req,"public-qr-cancel",20);if(!limit.ok)return rateLimitResponse(limit)
 try{const body=await req.json().catch(()=>({}));const session_token=String(body.session_token||"").trim();const order_id=String(body.order_id||"").trim();if(!session_token||!order_id)throw new Error("Order cancellation details are required");const {data,error}=await supabaseCloudAdmin.rpc("cancel_public_qr_order",{p_session_token:session_token,p_order_id:order_id,p_reason:"Cancelled by customer"});if(error)throw new Error(error.message||"Unable to cancel order");return Response.json(data||{success:true})}catch(e){return Response.json({success:false,error:e.message||"Unable to cancel order"},{status:400})}
}
