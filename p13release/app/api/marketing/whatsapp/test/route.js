import {NextResponse} from "next/server"
import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {requireApiUser} from "@/lib/serverAuth"
import {requireStaffPermission} from "@/lib/serverStaffPermissions"
import {resolveRestaurantForUser} from "@/lib/restaurantResolver"
import {decryptMarketingToken,metaGraphBase} from "@/lib/marketingMeta"
export const runtime="nodejs"
export async function POST(req){
 try{
  const user=await requireApiUser(req);const r=await resolveRestaurantForUser(user);if(!r.restaurantId)throw new Error("Restaurant not found");await requireStaffPermission(user,r.restaurantId,"marketing");
  const {data:plugin}=await supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id",r.restaurantId).eq("plugin_code","whatsapp-marketing").maybeSingle();if(plugin?.enabled!==true)throw new Error("WhatsApp Marketing plugin is not active");
  const {data:s}=await supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id",r.restaurantId).eq("plugin_code","whatsapp-marketing").maybeSingle();const c=s?.config||{};const token=decryptMarketingToken(c.access_token);if(!token||!c.phone_number_id)throw new Error("Configure WhatsApp Phone Number ID and access token first");
  const u=new URL(`${metaGraphBase()}/${c.phone_number_id}`);u.searchParams.set("fields","id,display_phone_number,verified_name,quality_rating");const res=await fetch(u,{headers:{Authorization:`Bearer ${token}`}});const d=await res.json().catch(()=>({}));if(!res.ok||d.error)throw new Error(d.error?.message||`WhatsApp API ${res.status}`);
  return NextResponse.json({success:true,details:d})
 }catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}
}
