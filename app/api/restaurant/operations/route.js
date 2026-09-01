import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

async function restaurantForUser(user) {
  const resolved = await resolveRestaurantForUser(user)
  if (!resolved.restaurantId) throw new Error("Restaurant profile not found")
  return { restaurant_id: resolved.restaurantId, role: resolved.role }
}

export async function POST(req){
  try{
    const user=await requireApiUser(req)
    const profile=await restaurantForUser(user)
    const body=await req.json()
    const action=String(body.action||"").trim()
    const rid=profile.restaurant_id

    if(!action) throw new Error("Action is required")

    if(["hold","park"].includes(action)){
      if(!body.order_id) throw new Error("order_id is required")
      const holdType=action
      const {error}=await supabaseCloudAdmin.from("orders").update({hold_status:holdType,status:"pending"}).eq("id",body.order_id).eq("restaurant_id",rid)
      if(error) throw error
      await supabaseCloudAdmin.from("order_holds").insert({restaurant_id:rid,order_id:body.order_id,hold_type:holdType,note:body.note||null,created_by:user.id})
      return NextResponse.json({success:true,action})
    }

    if(action==="reopen"){
      const {error}=await supabaseCloudAdmin.from("orders").update({hold_status:"active",reopened_at:new Date().toISOString(),void_reason:null}).eq("id",body.order_id).eq("restaurant_id",rid)
      if(error) throw error
      return NextResponse.json({success:true})
    }

    if(action==="void"){
      const {error}=await supabaseCloudAdmin.from("orders").update({status:"cancelled",void_reason:body.reason||"Voided by staff",cancelled_at:new Date().toISOString()}).eq("id",body.order_id).eq("restaurant_id",rid)
      if(error) throw error
      return NextResponse.json({success:true})
    }

    if(action==="refund"){
      const amount=Number(body.amount||0)
      if(!body.order_id || amount<=0) throw new Error("order_id and positive amount are required")
      const {data:payment}=await supabaseCloudAdmin.from("order_payments").select("id").eq("restaurant_id",rid).eq("order_id",body.order_id).eq("status","paid").order("paid_at",{ascending:false}).limit(1).maybeSingle()
      const {error}=await supabaseCloudAdmin.from("order_refunds").insert({restaurant_id:rid,order_id:body.order_id,payment_id:payment?.id||null,amount,reason:body.reason||"Customer refund",created_by:user.id})
      if(error) throw error
      if(payment?.id) await supabaseCloudAdmin.from("order_payments").update({status:"refunded"}).eq("id",payment.id)
      return NextResponse.json({success:true})
    }

    if(action==="payment"){
      const amount=Number(body.amount||0)
      if(!body.order_id || amount<=0) throw new Error("order_id and positive amount are required")
      const method=["cash","card","upi","online","credit","other"].includes(body.payment_method)?body.payment_method:"cash"
      const {error}=await supabaseCloudAdmin.from("order_payments").insert({restaurant_id:rid,order_id:body.order_id,payment_method:method,amount,reference:body.reference||null,status:"paid",created_by:user.id})
      if(error) throw error
      return NextResponse.json({success:true})
    }

    if(action==="split"){
      const parts=Math.max(2,Math.floor(Number(body.parts||2)))
      const total=Number(body.total||0)
      const each=total/parts
      const rows=Array.from({length:parts},(_,i)=>({restaurant_id:rid,order_id:body.order_id,split_no:i+1,amount:Number(each.toFixed(2))}))
      const {error}=await supabaseCloudAdmin.from("order_splits").upsert(rows,{onConflict:"order_id,split_no"})
      if(error) throw error
      return NextResponse.json({success:true,parts})
    }

    if(action==="merge"){
      const ids=Array.isArray(body.order_ids)?body.order_ids.filter(Boolean):[]
      if(ids.length<2) throw new Error("At least two orders are required")
      const {data:rows,error}=await supabaseCloudAdmin.from("orders").select("id,total_amount").eq("restaurant_id",rid).in("id",ids)
      if(error) throw error
      const total=(rows||[]).reduce((n,x)=>n+Number(x.total_amount||0),0)
      const [target,...rest]=rows||[]
      if(!target) throw new Error("Orders not found")
      await supabaseCloudAdmin.from("orders").update({total_amount:total}).eq("id",target.id).eq("restaurant_id",rid)
      if(rest.length) await supabaseCloudAdmin.from("orders").update({status:"cancelled",void_reason:`Merged into ${target.id}`}).in("id",rest.map(x=>x.id)).eq("restaurant_id",rid)
      return NextResponse.json({success:true,target_order_id:target.id,total})
    }

    if(action==="transfer_table"){
      const {order_id,to_table_id}=body
      if(!order_id||!to_table_id) throw new Error("order_id and to_table_id are required")
      const {data:order,error}=await supabaseCloudAdmin.from("orders").select("source_id").eq("id",order_id).eq("restaurant_id",rid).single()
      if(error) throw error
      const {error:updateError}=await supabaseCloudAdmin.from("orders").update({source_type:"table",source_id:to_table_id,source_label:body.source_label||null}).eq("id",order_id).eq("restaurant_id",rid)
      if(updateError) throw updateError
      await supabaseCloudAdmin.from("order_transfers").insert({restaurant_id:rid,order_id,from_table_id:order.source_id,to_table_id,moved_by:user.id})
      return NextResponse.json({success:true})
    }

    if(action==="move_items"){
      if(!body.order_item_id||!body.order_id||!body.to_table_id) throw new Error("order_item_id, order_id and to_table_id are required")
      const {data:order}=await supabaseCloudAdmin.from("orders").select("source_id").eq("id",body.order_id).eq("restaurant_id",rid).single()
      await supabaseCloudAdmin.from("order_item_moves").insert({restaurant_id:rid,order_item_id:body.order_item_id,order_id:body.order_id,from_table_id:order?.source_id||null,to_table_id:body.to_table_id,quantity:Number(body.quantity||1),moved_by:user.id})
      return NextResponse.json({success:true})
    }

    if(action==="kds"){
      if(!body.order_id) throw new Error("order_id is required")
      const status=String(body.status||"new")
      const patch={restaurant_id:rid,order_id:body.order_id,status,priority:body.priority||"normal",due_at:body.due_at||null}
      const timestamps={accepted:"accepted_at",preparing:"preparing_at",ready:"ready_at",served:"served_at"}
      if(timestamps[status]) patch[timestamps[status]]=new Date().toISOString()
      const {error}=await supabaseCloudAdmin.from("kitchen_order_tickets").insert(patch)
      if(error) throw error
      await supabaseCloudAdmin.from("orders").update({status}).eq("id",body.order_id).eq("restaurant_id",rid)
      return NextResponse.json({success:true})
    }

    throw new Error("Unsupported action")
  }catch(e){
    console.error("restaurant operations",e)
    return NextResponse.json({success:false,error:e.message||"Operation failed"},{status:400})
  }
}
