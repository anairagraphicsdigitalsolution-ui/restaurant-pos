import { NextResponse } from "next/server"
import crypto from "crypto"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { cashfreeRequest } from "@/lib/cashfree"

export const runtime="nodejs"

export async function POST(req){
  try{
    const user=await requireApiUser(req)
    const body=await req.json()
    const orderId=String(body?.order_id||"").trim()
    const amount=Number(body?.amount||0)
    if(!orderId || !Number.isFinite(amount) || amount<=0) return NextResponse.json({success:false,error:"order_id and a valid refund amount are required"},{status:400})
    const {data:profile}=await supabaseCloudAdmin.from("profiles").select("id,role,restaurant_id").eq("id",user.id).maybeSingle()
    if(!profile || !["admin","super_admin"].includes(profile.role)) throw new Error("Not authorized")
    const {data:order}=await supabaseCloudAdmin.from("orders").select("id,restaurant_id,total_amount").eq("id",orderId).maybeSingle()
    if(!order) throw new Error("Order not found")
    if(profile.role!=="super_admin" && profile.restaurant_id!==order.restaurant_id) throw new Error("Not authorized")
    const {data:settings}=await supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id",order.restaurant_id).eq("plugin_code","cashfree-payment-gateway").maybeSingle()
    const {data:attempt}=await supabaseCloudAdmin.from("cashfree_payment_attempts").select("cashfree_order_id").eq("restaurant_id",order.restaurant_id).eq("order_id",order.id).eq("status","SUCCESS").order("created_at",{ascending:false}).limit(1).maybeSingle()
    if(!attempt) throw new Error("No successful Cashfree payment found for this order")
    const refundId=`refund_${crypto.randomUUID().replace(/-/g,"").slice(0,28)}`
    const result=await cashfreeRequest(`/orders/${encodeURIComponent(attempt.cashfree_order_id)}/refunds`,{
      config:settings?.config||{},method:"POST",
      body:{refund_amount:Number(amount.toFixed(2)),refund_id:refundId,refund_note:String(body?.note||"Anaira POS refund").slice(0,100),refund_speed:String(body?.speed||"STANDARD")}
    })
    await supabaseCloudAdmin.from("order_refunds").insert({
      restaurant_id:order.restaurant_id,order_id:order.id,amount:Number(amount.toFixed(2)),
      reason:String(body?.note||"Cashfree refund").slice(0,250),status:String(result?.refund_status||"pending").toLowerCase(),created_by:user.id
    })
    return NextResponse.json({success:true,refund:result})
  }catch(e){return NextResponse.json({success:false,error:e.message||"Unable to create Cashfree refund"},{status:/not authorized/i.test(e.message||"")?403:400})}
}
