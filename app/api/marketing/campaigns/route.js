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

async function ctx(req){const user=await requireApiUser(req);const r=await resolveRestaurantForUser(user);if(!r.restaurantId)throw new Error("Restaurant not found");await requireStaffPermission(user,r.restaurantId,"marketing");const enabled=await marketingEnabled(r.restaurantId);if(!enabled)throw new Error("Marketing is not active for this restaurant");return {user,restaurantId:r.restaurantId}}
export async function GET(req){try{const {restaurantId}=await ctx(req);const {data,error}=await supabaseCloudAdmin.from("marketing_campaigns").select("*").eq("restaurant_id",restaurantId).order("created_at",{ascending:false});if(error)throw error;return NextResponse.json({success:true,campaigns:data||[]})}catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}}
export async function POST(req){try{const {user,restaurantId}=await ctx(req);const b=await req.json();if(!String(b.name||"").trim())throw new Error("Campaign name is required");const {data,error}=await supabaseCloudAdmin.from("marketing_campaigns").insert({restaurant_id:restaurantId,name:String(b.name).trim(),objective:b.objective||"awareness",status:b.status||"draft",budget:Math.max(0,Number(b.budget||0)),start_at:b.start_at||null,end_at:b.end_at||null,created_by:user.id}).select("*").single();if(error)throw error;return NextResponse.json({success:true,campaign:data})}catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}}

export async function PATCH(req){try{const {restaurantId}=await ctx(req),b=await req.json();if(!b.id)throw new Error("Campaign id is required");const allowed={};for(const k of ["name","objective","status","budget","start_at","end_at"]){if(b[k]!==undefined)allowed[k]=b[k]}const {data,error}=await supabaseCloudAdmin.from("marketing_campaigns").update(allowed).eq("id",b.id).eq("restaurant_id",restaurantId).select("*").single();if(error)throw error;return NextResponse.json({success:true,campaign:data})}catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}}
