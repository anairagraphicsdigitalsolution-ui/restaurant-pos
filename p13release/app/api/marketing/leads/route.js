import {NextResponse} from "next/server"
import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {requireApiUser} from "@/lib/serverAuth"
import {requireStaffPermission} from "@/lib/serverStaffPermissions"
import {resolveRestaurantForUser} from "@/lib/restaurantResolver"
export const runtime="nodejs"
async function marketingEnabled(restaurantId){
  const {data:rows,error}=await supabaseCloudAdmin.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",restaurantId).in("plugin_code",["facebook-integration","instagram-integration","whatsapp-marketing"]);
  if(error) throw error;
  return (rows||[]).some(x=>x.enabled===true);
}

async function ctx(req){const user=await requireApiUser(req);const r=await resolveRestaurantForUser(user);if(!r.restaurantId)throw new Error("Restaurant not found");await requireStaffPermission(user,r.restaurantId,"marketing");const {data:rows}=await supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id",r.restaurantId).in("plugin_code",["facebook-integration","instagram-integration","whatsapp-marketing"]);if(!(rows||[]).some(x=>x.enabled===true))throw new Error("Marketing is not active for this restaurant");return {user,restaurantId:r.restaurantId}}
export async function GET(req){try{const {restaurantId}=await ctx(req);const {data,error}=await supabaseCloudAdmin.from("marketing_leads").select("*").eq("restaurant_id",restaurantId).order("created_at",{ascending:false}).limit(500);if(error)throw error;return NextResponse.json({success:true,leads:data||[]})}catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}}
export async function POST(req){try{const {restaurantId}=await ctx(req);const b=await req.json();const {data,error}=await supabaseCloudAdmin.from("marketing_leads").insert({restaurant_id:restaurantId,name:String(b.name||""),phone:b.phone||null,email:b.email||null,source:b.source||"manual",source_campaign:b.source_campaign||null,status:b.status||"new",notes:b.notes||null}).select("*").single();if(error)throw error;return NextResponse.json({success:true,lead:data})}catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}}
export async function PATCH(req){try{const {restaurantId}=await ctx(req);const b=await req.json();if(!b.id)throw new Error("Lead id is required");const allowed={};for(const k of ["name","phone","email","source","source_campaign","status","notes"]){if(b[k]!==undefined)allowed[k]=b[k]}const {data,error}=await supabaseCloudAdmin.from("marketing_leads").update(allowed).eq("id",b.id).eq("restaurant_id",restaurantId).select("*").single();if(error)throw error;return NextResponse.json({success:true,lead:data})}catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}}
