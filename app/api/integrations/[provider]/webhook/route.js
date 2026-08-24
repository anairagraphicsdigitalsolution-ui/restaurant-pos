import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"

export async function POST(req,{params}){
  const provider=String(params?.provider||"").toLowerCase()
  if(!["zomato","swiggy"].includes(provider)){
    return NextResponse.json({success:false,error:"Unsupported provider"},{status:404})
  }

  try{
    const body=await req.json()
    const outlet=String(
      body?.restaurant_id ||
      body?.restaurant?.id ||
      body?.outlet_id ||
      body?.outlet?.id ||
      body?.store_id ||
      body?.store?.id ||
      ""
    )

    let query=supabaseAdmin
      .from("aggregator_integrations")
      .select("id,restaurant_id,credentials,outlet_code")
      .eq("provider",provider)
      .eq("active",true)

    if(outlet) query=query.eq("outlet_code",outlet)

    const {data:rows,error}=await query.limit(10)
    if(error) throw error
    if(!rows?.length){
      // Keep the event for diagnostics only when it cannot be mapped.
      return NextResponse.json({success:false,error:"No active restaurant mapping for webhook"},{status:202})
    }

    const integration=rows[0]

    // Store the raw provider event durably. The order processor can consume
    // aggregator_orders later without losing the original payload.
    const externalOrderId=String(
      body?.order?.order_id ||
      body?.order_id ||
      body?.id ||
      `${provider}-${Date.now()}`
    )

    const {error:orderError}=await supabaseAdmin
      .from("aggregator_orders")
      .upsert({
        restaurant_id:integration.restaurant_id,
        integration_id:integration.id,
        provider,
        external_order_id:externalOrderId,
        status:String(body?.status||body?.order?.status||"received"),
        payload:body,
        updated_at:new Date().toISOString()
      },{onConflict:"restaurant_id,provider,external_order_id"})

    if(orderError) throw orderError

    await supabaseAdmin.from("aggregator_sync_jobs").insert({
      restaurant_id:integration.restaurant_id,
      provider,
      job_type:"webhook",
      status:"success",
      payload:body,
      finished_at:new Date().toISOString()
    })

    return NextResponse.json({success:true,received:true})
  }catch(e){
    console.error(`${provider} webhook`,e)
    return NextResponse.json({success:false,error:e.message||"Webhook processing failed"},{status:400})
  }
}
