import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { cashfreeRequest, normalizeCashfreeStatus, verifyCashfreeWebhook } from "@/lib/cashfree"

export const runtime="nodejs"

export async function POST(req){
  try{
    const raw=await req.text()
    const signature=req.headers.get("x-webhook-signature")||""
    const timestamp=req.headers.get("x-webhook-timestamp")||""
    const webhookVersion=req.headers.get("x-webhook-version")||""
    const url=new URL(req.url)
    const restaurantId=String(url.searchParams.get("restaurant_id")||"").trim()

    let payload
    try{payload=JSON.parse(raw)}catch{return NextResponse.json({success:false,error:"Invalid webhook payload"},{status:400})}

    const cashfreeOrderId=String(
      payload?.data?.order?.order_id ||
      payload?.data?.payment?.order_id ||
      payload?.order_id ||
      ""
    ).trim()
    if(!cashfreeOrderId) return NextResponse.json({success:true,ignored:true})

    let lookup = supabaseCloudAdmin.from("cashfree_payment_attempts").select("*").eq("cashfree_order_id",cashfreeOrderId)
    if(restaurantId) lookup=lookup.eq("restaurant_id",restaurantId)
    const {data:attempt,error:attemptError}=await lookup.maybeSingle()
    if(attemptError) throw attemptError
    if(!attempt) return NextResponse.json({success:true,ignored:true})

    const {data:settings,error:settingsError}=await supabaseCloudAdmin.from("plugin_settings").select("config")
      .eq("restaurant_id",attempt.restaurant_id).eq("plugin_code","cashfree-payment-gateway").maybeSingle()
    if(settingsError) throw settingsError
    const config=settings?.config||{}
    if(!signature || !timestamp || !webhookVersion) {
      return NextResponse.json({success:false,error:"Missing Cashfree webhook security headers"},{status:401})
    }
    if(!verifyCashfreeWebhook(raw,timestamp,signature,String(config.client_secret||""))){
      return NextResponse.json({success:false,error:"Invalid Cashfree webhook signature"},{status:401})
    }

    // Reconcile with Cashfree's authoritative payment list instead of trusting
    // only the webhook body. This also handles duplicate/multiple transactions.
    const payments=await cashfreeRequest(`/orders/${encodeURIComponent(cashfreeOrderId)}/payments`,{config})
    const successful=(payments||[]).find(p=>String(p.payment_status||"").toUpperCase()==="SUCCESS")
    const latest=successful||payments?.[0]
    const status=normalizeCashfreeStatus(latest?.payment_status)
    const amount=Number(successful?.payment_amount||attempt.amount||0)

    await supabaseCloudAdmin.from("cashfree_payment_attempts").update({
      cf_payment_id:successful?.cf_payment_id?String(successful.cf_payment_id):attempt.cf_payment_id||null,
      status,payment_group:successful?.payment_group||null,bank_reference:successful?.bank_reference||null,
      raw_status:latest||payload,updated_at:new Date().toISOString()
    }).eq("id",attempt.id)

    if(status==="SUCCESS"){
      const reference=`cashfree:${cashfreeOrderId}`
      await supabaseCloudAdmin.from("order_payments").update({
        status:"paid",amount:amount||Number(attempt.amount||0),
        reference:`${reference}:${successful?.cf_payment_id||"paid"}`,
        paid_at:new Date().toISOString(),notes:"Cashfree Payment Gateway · webhook verified"
      }).eq("restaurant_id",attempt.restaurant_id).eq("order_id",attempt.order_id).eq("reference",reference).eq("status","pending")

      const {data:paidRows}=await supabaseCloudAdmin.from("order_payments").select("amount")
        .eq("restaurant_id",attempt.restaurant_id).eq("order_id",attempt.order_id).eq("status","paid")
      const paid=(paidRows||[]).reduce((sum,row)=>sum+Number(row.amount||0),0)
      const {data:order}=await supabaseCloudAdmin.from("orders").select("total_amount").eq("id",attempt.order_id).maybeSingle()
      const total=Number(order?.total_amount||0)
      await supabaseCloudAdmin.from("orders").update({
        paid_amount:paid,payment_status:paid>=total&&total>0?"paid":paid>0?"partially_paid":"unpaid",
        payment_method:"online"
      }).eq("id",attempt.order_id).eq("restaurant_id",attempt.restaurant_id)
    }
    return NextResponse.json({success:true,processed:true,status})
  }catch(e){
    console.error("CASHFREE WEBHOOK:",e)
    return NextResponse.json({success:false,error:"Webhook processing failed"},{status:500})
  }
}
