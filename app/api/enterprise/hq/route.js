import { requireApiUser } from "@/lib/serverAuth"
import { requireFeature } from "@/lib/featureGateServer"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { NextResponse } from "next/server"

const json=(x,s=200)=>NextResponse.json(x,{status:s})
async function ctx(req){
 const user=await requireApiUser(req); const id=new URL(req.url).searchParams.get("enterprise_id")
 if(!id) throw Object.assign(new Error("enterprise_id is required"),{status:400})
 const {data:memberRestaurant}=await supabaseCloudAdmin.from("enterprise_members").select("restaurant_id").eq("enterprise_id",id).eq("user_id",user.id).maybeSingle()
 if(memberRestaurant?.restaurant_id) await requireFeature(memberRestaurant.restaurant_id,"p1-enterprise-hq")
 const {data:m,error}=await supabaseCloudAdmin.from("enterprise_members").select("role").eq("enterprise_id",id).eq("user_id",user.id).maybeSingle()
 if(error) throw error; if(!m) throw Object.assign(new Error("Enterprise access denied"),{status:403})
 return {user,id,role:m.role}
}
export async function GET(req){try{const {id}=await ctx(req);const u=new URL(req.url);const days=Math.min(Math.max(Number(u.searchParams.get("days")||30),1),365);const tab=u.searchParams.get("tab")||"summary";
 if(tab==="reports"){const {data,error}=await supabaseCloudAdmin.rpc("p1_8_consolidated_reports",{p_enterprise_id:id,p_start:u.searchParams.get("start"),p_end:u.searchParams.get("end")});if(error)throw error;return json({success:true,data})}
 if(tab==="accounting"){const {data,error}=await supabaseCloudAdmin.rpc("p1_8_group_accounting",{p_enterprise_id:id,p_start:u.searchParams.get("start"),p_end:u.searchParams.get("end")});if(error)throw error;return json({success:true,data})}
 const {data,error}=await supabaseCloudAdmin.rpc("p1_8_hq_summary",{p_enterprise_id:id,p_days:days});if(error)throw error;return json({success:true,...data,role:ctx?undefined:undefined})
 }catch(e){return json({success:false,error:e?.message||"Enterprise HQ error"},e?.status||(/access denied|not authorized/i.test(e?.message||"")?403:500))}}
export async function POST(req){try{const {user,id}=await ctx(req);const b=await req.json();const action=String(b.action||"");let data,error
 if(action==="menu_create"){({data,error}=await supabaseCloudAdmin.from("enterprise_menu_catalog").insert({enterprise_id:id,name:b.name,category:b.category||null,description:b.description||null,image:b.image||null,base_price:Number(b.base_price||0),active:b.active!==false}).select().single())}
 else if(action==="menu_update"){({data,error}=await supabaseCloudAdmin.from("enterprise_menu_catalog").update({name:b.name,category:b.category||null,description:b.description||null,image:b.image||null,base_price:Number(b.base_price||0),active:b.active!==false,updated_at:new Date().toISOString()}).eq("id",b.id).eq("enterprise_id",id).select().single())}
 else if(action==="price_upsert"){({data,error}=await supabaseCloudAdmin.from("enterprise_menu_prices").upsert({enterprise_id:id,catalog_item_id:b.catalog_item_id,restaurant_id:b.restaurant_id,price:Number(b.price||0),available:b.available!==false,updated_at:new Date().toISOString()},{onConflict:"catalog_item_id,restaurant_id"}).select().single())}
 else if(action==="transfer_request"){({data,error}=await supabaseCloudAdmin.rpc("p1_8_request_transfer",{p_enterprise_id:id,p_from:b.from_restaurant_id,p_to:b.to_restaurant_id,p_inventory_id:b.inventory_id||null,p_item_name:b.item_name,p_quantity:Number(b.quantity),p_unit:b.unit||null,p_idempotency_key:b.idempotency_key||crypto.randomUUID(),p_notes:b.notes||null}) )}
 else if(action==="transfer_decide"){({data,error}=await supabaseCloudAdmin.rpc("p1_8_decide_transfer",{p_transfer_id:b.id,p_status:b.status,p_note:b.note||null}))}
 else if(action==="transfer_receive"){({data,error}=await supabaseCloudAdmin.rpc("p1_8_receive_transfer",{p_transfer_id:b.id}))}
 else if(action==="approval_decide"){({data,error}=await supabaseCloudAdmin.rpc("p1_8_decide_approval",{p_approval_id:b.id,p_status:b.status,p_note:b.note||null}))}
 else if(action==="staff_move"){({data,error}=await supabaseCloudAdmin.rpc("p1_8_request_staff_move",{p_enterprise_id:id,p_staff_id:b.staff_id,p_from:b.from_restaurant_id,p_to:b.to_restaurant_id,p_effective_date:b.effective_date||null,p_reason:b.reason||null,p_idempotency_key:b.idempotency_key||crypto.randomUUID()}))}
 else throw Object.assign(new Error("Unknown enterprise HQ action"),{status:400})
 if(error)throw error
 return json({success:true,data})
 }catch(e){return json({success:false,error:e?.message||"Enterprise HQ action failed"},e?.status||(/access denied|not authorized/i.test(e?.message||"")?403:400))}}
