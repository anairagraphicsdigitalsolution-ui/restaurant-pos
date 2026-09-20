import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

async function getRestaurant(user){
  const {data,error}=await supabaseCloudAdmin.from("profiles").select("restaurant_id,role").eq("id",user.id).maybeSingle()
  if(error) throw error
  if(!data?.restaurant_id) throw new Error("Restaurant access not found")
  return data.restaurant_id
}

export async function GET(req){
  try{
    const user=await requireApiUser(req); const rid=await getRestaurant(user)
    const q=new URL(req.url).searchParams.get("q")?.trim()||""
    let query=supabaseCloudAdmin.from("gift_cards").select("*,gift_card_transactions(id,transaction_type,amount,balance_after,order_id,reference,idempotency_key,notes,created_at)").eq("restaurant_id",rid).order("created_at",{ascending:false})
    if(q) query=query.ilike("code",`%${q.toUpperCase()}%`)
    const {data,error}=await query.limit(200)
    if(error) throw error
    return Response.json({success:true,gift_cards:data||[]})
  }catch(e){return Response.json({success:false,error:e.message||"Gift cards load failed"},{status:403})}
}

export async function POST(req){
  try{
    const user=await requireApiUser(req); const rid=await getRestaurant(user); const b=await req.json(); const op=String(b?.operation||"")
    let rpc,args
    if(op==="issue") {rpc="p1_1_issue_gift_card";args={p_restaurant_id:rid,p_code:b.code,p_amount:Number(b.amount),p_customer_id:b.customer_id||null,p_purchaser_name:b.purchaser_name||null,p_recipient_name:b.recipient_name||null,p_recipient_phone:b.recipient_phone||null,p_expires_at:b.expires_at||null,p_idempotency_key:b.idempotency_key||crypto.randomUUID()}}
    else if(op==="activate") {rpc="p1_1_activate_gift_card";args={p_restaurant_id:rid,p_gift_card_id:b.gift_card_id,p_idempotency_key:b.idempotency_key||crypto.randomUUID()}}
    else if(op==="redeem") {rpc="p1_1_redeem_gift_card";args={p_restaurant_id:rid,p_code:b.code,p_amount:Number(b.amount),p_order_id:b.order_id||null,p_idempotency_key:b.idempotency_key||crypto.randomUUID(),p_notes:b.notes||null}}
    else if(op==="refund") {rpc="p1_1_refund_gift_card";args={p_restaurant_id:rid,p_gift_card_id:b.gift_card_id,p_amount:Number(b.amount),p_order_id:b.order_id||null,p_idempotency_key:b.idempotency_key||crypto.randomUUID(),p_notes:b.notes||null}}
    else if(op==="lookup") {rpc="p1_1_lookup_gift_card";args={p_restaurant_id:rid,p_code:b.code}}
    else return Response.json({success:false,error:"Unsupported operation"},{status:400})
    const {data,error}=await supabaseCloudAdmin.rpc(rpc,args); if(error) throw error
    return Response.json(data||{success:true})
  }catch(e){return Response.json({success:false,error:e.message||"Gift card operation failed"},{status:400})}
}
