import { NextResponse } from "next/server"
import crypto from "crypto"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { cashfreeRequest } from "@/lib/cashfree"

export const runtime="nodejs"

async function getContext(req,orderId){
  const user=await requireApiUser(req)
  const {data:profile,error:profileError}=await supabaseCloudAdmin.from("profiles")
    .select("id,role,restaurant_id").eq("id",user.id).maybeSingle()
  if(profileError||!profile) throw new Error("Profile not found")
  if(!["admin","super_admin"].includes(profile.role)) throw new Error("Not authorized")
  const {data:order,error}=await supabaseCloudAdmin.from("orders")
    .select("id,restaurant_id,total_amount,paid_amount,payment_status,customer_name,customer_phone,customer_id,invoice_no")
    .eq("id",orderId).maybeSingle()
  if(error) throw error
  if(!order) throw new Error("Order not found")
  if(profile.role!=="super_admin" && profile.restaurant_id!==order.restaurant_id) throw new Error("Not authorized")
  return {user,profile,order}
}

export async function POST(req){
  try{
    const body=await req.json()
    const orderId=String(body?.order_id||"").trim()
    if(!orderId) return NextResponse.json({success:false,error:"order_id is required"},{status:400})
    const {user,order}=await getContext(req,orderId)

    const {data:plugin}=await supabaseCloudAdmin.from("restaurant_plugins").select("enabled")
      .eq("restaurant_id",order.restaurant_id).eq("plugin_code","cashfree-payment-gateway").maybeSingle()
    if(plugin?.enabled!==true) throw new Error("Cashfree Payment Gateway is not enabled for this restaurant")

    const {data:settings,error:settingsError}=await supabaseCloudAdmin.from("plugin_settings")
      .select("config").eq("restaurant_id",order.restaurant_id).eq("plugin_code","cashfree-payment-gateway").maybeSingle()
    if(settingsError) throw settingsError
    const config=settings?.config||{}
    if(config.enabled_for_restaurant===false) throw new Error("Cashfree payments are disabled for this restaurant")

    const total=Number(order.total_amount||0)
    const paid=Number(order.paid_amount||0)
    const amount=Math.max(0,Number((total-paid).toFixed(2)))
    if(amount<=0) throw new Error("This order has no payable balance")

    const customerId=String(order.customer_id||`customer_${order.id}`).replace(/[^A-Za-z0-9_-]/g,"").slice(0,50) || `customer_${order.id}`
    const customerPhone=String(order.customer_phone||body?.customer_phone||"").replace(/\D/g,"").slice(-10)
    if(config.customer_phone_required!==false && customerPhone.length!==10) throw new Error("A valid 10-digit customer phone is required for Cashfree checkout")

    const {data:existing}=await supabaseCloudAdmin.from("cashfree_payment_attempts").select("*")
      .eq("restaurant_id",order.restaurant_id).eq("order_id",order.id).in("status",["PENDING","NOT_ATTEMPTED"])
      .order("created_at",{ascending:false}).limit(1).maybeSingle()
    if(existing?.payment_session_id){
      return NextResponse.json({success:true,reused:true,order_id:order.id,cashfree_order_id:existing.cashfree_order_id,payment_session_id:existing.payment_session_id,amount:Number(existing.amount||amount)})
    }

    const origin=String(body?.origin||"").replace(/\/$/,"")
    const configuredReturn=String(config.return_url||"").trim()
    const configuredNotify=String(config.notify_url||"").trim()
    const returnUrl=configuredReturn || (origin?`${origin}/dashboard/payment-gateway/return?order_id=${encodeURIComponent(order.id)}`:undefined)
    const notifyUrl=configuredNotify || (origin?`${origin}/api/payments/cashfree/webhook?restaurant_id=${encodeURIComponent(order.restaurant_id)}`:undefined)

    const cfOrderId=`anaira_${String(order.id).replace(/-/g,"").slice(0,20)}_${Date.now()}`
    const paymentMethods=[
      config.allow_upi!==false ? "upi" : null,
      config.allow_cards!==false ? "cc,dc" : null,
      config.allow_netbanking!==false ? "nb" : null,
      config.allow_wallets===true ? "app" : null
    ].filter(Boolean).join(",")
    const payload={
      order_id:cfOrderId,
      order_amount:amount,
      order_currency:"INR",
      customer_details:{customer_id:customerId,customer_phone:customerPhone},
      order_meta:{
        ...(returnUrl?{return_url:returnUrl}:{}),
        ...(notifyUrl?{notify_url:notifyUrl}:{}),
        ...(paymentMethods?{payment_methods:paymentMethods}:{})
      },
      order_expiry_time:new Date(Date.now()+Math.max(5,Number(config.order_expiry_minutes||30))*60*1000).toISOString(),
      order_note:`Anaira POS order ${order.invoice_no || order.id}`
    }
    if(order.customer_name) payload.customer_details.customer_name=String(order.customer_name).slice(0,100)

    const result=await cashfreeRequest("/orders",{config,method:"POST",body:payload,headers:{"x-idempotency-key":crypto.randomUUID()}})
    const cashfreeOrderId=result.order_id||cfOrderId

    await supabaseCloudAdmin.from("cashfree_payment_attempts").insert({
      restaurant_id:order.restaurant_id,order_id:order.id,cashfree_order_id:cashfreeOrderId,
      payment_session_id:result.payment_session_id||null,amount,status:"PENDING",raw_status:result||{}
    })
    await supabaseCloudAdmin.from("order_payments").insert({
      restaurant_id:order.restaurant_id,order_id:order.id,payment_method:"online",amount,
      reference:`cashfree:${cashfreeOrderId}`,status:"pending",created_by:user.id,
      notes:"Cashfree Payment Gateway"
    })
    return NextResponse.json({success:true,order_id:order.id,cashfree_order_id:cashfreeOrderId,payment_session_id:result.payment_session_id,amount})
  }catch(e){
    console.error("CASHFREE CREATE ORDER:",e)
    return NextResponse.json({success:false,error:e.message||"Unable to create Cashfree payment"},{status:/not authorized|profile/i.test(e.message||"")?403:400})
  }
}
