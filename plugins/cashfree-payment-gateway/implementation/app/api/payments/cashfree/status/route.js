import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { cashfreeRequest, normalizeCashfreeStatus } from "@/lib/cashfree"

export const runtime="nodejs"

async function authorize(req,orderId){
  const user=await requireApiUser(req)
  const {data:profile}=await supabaseCloudAdmin.from("profiles").select("id,role,restaurant_id").eq("id",user.id).maybeSingle()
  if(!profile || !["admin","super_admin"].includes(profile.role)) throw new Error("Not authorized")
  const {data:order}=await supabaseCloudAdmin.from("orders").select("id,restaurant_id,total_amount,paid_amount").eq("id",orderId).maybeSingle()
  if(!order) throw new Error("Order not found")
  if(profile.role!=="super_admin" && profile.restaurant_id!==order.restaurant_id) throw new Error("Not authorized")
  return {user,profile,order}
}
async function syncPayment(order,attempt,config,payments){
  const successful=(payments||[]).find(p=>String(p.payment_status||"").toUpperCase()==="SUCCESS")
  const latest=successful || payments?.[0]
  const status=normalizeCashfreeStatus(latest?.payment_status)
  const amount=Number(successful?.payment_amount||attempt?.amount||0)
  await supabaseCloudAdmin.from("cashfree_payment_attempts").update({
    cf_payment_id:successful?.cf_payment_id?String(successful.cf_payment_id):attempt?.cf_payment_id||null,
    status, payment_group:successful?.payment_group||null, bank_reference:successful?.bank_reference||null,
    raw_status:latest||{}, updated_at:new Date().toISOString()
  }).eq("id",attempt.id)
  if(status==="SUCCESS"){
    const reference=`cashfree:${attempt.cashfree_order_id}`
    await supabaseCloudAdmin.from("order_payments").update({
      status:"paid",amount:amount||Number(attempt.amount||0),reference:`${reference}:${successful?.cf_payment_id||"paid"}`,
      paid_at:new Date().toISOString(),notes:"Cashfree Payment Gateway · verified"
    }).eq("restaurant_id",order.restaurant_id).eq("order_id",order.id).eq("reference",reference).eq("status","pending")
    const {data:paidRows}=await supabaseCloudAdmin.from("order_payments").select("amount").eq("restaurant_id",order.restaurant_id).eq("order_id",order.id).eq("status","paid")
    const paid=(paidRows||[]).reduce((sum,row)=>sum+Number(row.amount||0),0)
    const total=Number(order.total_amount||0)
    await supabaseCloudAdmin.from("orders").update({
      paid_amount:paid,
      payment_status:paid>=total&&total>0?"paid":paid>0?"partially_paid":"unpaid",
      payment_method:"online"
    }).eq("id",order.id).eq("restaurant_id",order.restaurant_id)
  }
  return {status,payment:successful||latest||null}
}
export async function GET(req){
  try{
    const q=new URL(req.url).searchParams
    const orderId=String(q.get("order_id")||"").trim()
    if(!orderId) return NextResponse.json({success:false,error:"order_id is required"},{status:400})
    const {order}=await authorize(req,orderId)
    const {data:attempt}=await supabaseCloudAdmin.from("cashfree_payment_attempts").select("*")
      .eq("restaurant_id",order.restaurant_id).eq("order_id",order.id).order("created_at",{ascending:false}).limit(1).maybeSingle()
    if(!attempt) throw new Error("No Cashfree payment attempt found for this order")
    const {data:settings}=await supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id",order.restaurant_id).eq("plugin_code","cashfree-payment-gateway").maybeSingle()
    const payments=await cashfreeRequest(`/orders/${encodeURIComponent(attempt.cashfree_order_id)}/payments`,{config:settings?.config||{}})
    const result=await syncPayment(order,attempt,settings?.config||{},payments)
    return NextResponse.json({success:true,order_id:order.id,cashfree_order_id:attempt.cashfree_order_id,...result})
  }catch(e){return NextResponse.json({success:false,error:e.message||"Unable to verify Cashfree payment"},{status:/not authorized/i.test(e.message||"")?403:400})}
}
