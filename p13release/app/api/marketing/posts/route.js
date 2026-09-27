import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { requireStaffPermission } from "@/lib/serverStaffPermissions"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

export const runtime="nodejs"

async function marketingEnabled(restaurantId){
  const {data:rows,error}=await supabaseCloudAdmin.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",restaurantId).in("plugin_code",["facebook-integration","instagram-integration","whatsapp-marketing"]);
  if(error) throw error;
  return (rows||[]).some(x=>x.enabled===true);
}

async function ctx(req){
  const user=await requireApiUser(req)
  const r=await resolveRestaurantForUser(user)
  if(!r.restaurantId) throw new Error("Restaurant not found")
  await requireStaffPermission(user,r.restaurantId,"marketing")
  const {data:rows,error}=await supabaseCloudAdmin.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",r.restaurantId).in("plugin_code",["facebook-integration","instagram-integration","whatsapp-marketing"])
  if(error) throw error
  if(!(rows||[]).some(x=>x.enabled===true)) throw new Error("Marketing is not active for this restaurant")
  return {user,restaurantId:r.restaurantId}
}

export async function GET(req){
  try{
    const {restaurantId}=await ctx(req)
    const {data,error}=await supabaseCloudAdmin.from("marketing_posts").select("*").eq("restaurant_id",restaurantId).order("created_at",{ascending:false}).limit(200)
    if(error) throw error
    return NextResponse.json({success:true,posts:data||[]})
  }catch(e){return NextResponse.json({success:false,error:e.message||"Unable to load marketing posts"},{status:400})}
}

export async function POST(req){
  try{
    const {user,restaurantId}=await ctx(req)
    const body=await req.json()
    const platform=String(body.platform||"").toLowerCase()
    const type=String(body.content_type||"text").toLowerCase()
    if(!["facebook","instagram","whatsapp"].includes(platform)) throw new Error("Unsupported platform")
    const pluginCode=platform==="whatsapp"?"whatsapp-marketing":`${platform}-integration`;
    const {data:plugin}=await supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id",restaurantId).eq("plugin_code",pluginCode).maybeSingle();
    if(plugin?.enabled!==true) throw new Error(`${platform} marketing plugin is not active`)
    if(!["text","image","carousel","reel","whatsapp"].includes(type)) throw new Error("Unsupported content type")
    const row={restaurant_id:restaurantId,platform,content_type:type,caption:String(body.caption||body.message||""),media_urls:Array.isArray(body.media_urls)?body.media_urls:[],media_paths:Array.isArray(body.media_paths)?body.media_paths.filter(Boolean):[],status:body.status==="scheduled"?"scheduled":"draft",scheduled_at:body.scheduled_at||null,campaign_id:body.campaign_id||null,source_type:body.source_type||"manual",source_id:body.source_id||null,hashtags:Array.isArray(body.hashtags)?body.hashtags:[],location:body.location||null,cta_type:body.cta_type||null,cta_url:body.cta_url||null,video_url:body.video_url||null,template_name:body.template_name||null,template_language:body.template_language||null,consent_required:body.consent_required!==false,created_by:user.id,idempotency_key:body.idempotency_key||null}
    const {data,error}=await supabaseCloudAdmin.from("marketing_posts").insert(row).select("*").single()
    if(error) throw error
    return NextResponse.json({success:true,post:data})
  }catch(e){return NextResponse.json({success:false,error:e.message||"Unable to create post"},{status:400})}
}

export async function PATCH(req){
  try{
    const {restaurantId}=await ctx(req)
    const body=await req.json(); const id=String(body.id||"")
    if(!id) throw new Error("Post id is required")
    const allowed={}
    for(const key of ["platform","content_type","caption","media_urls","media_paths","scheduled_at","campaign_id","source_type","hashtags","location","cta_type","cta_url","video_url","template_name","template_language"]){if(body[key]!==undefined)allowed[key]=body[key]} if(body.status!==undefined){const status=String(body.status); if(!["draft","scheduled","cancelled","published"].includes(status)) throw new Error("Invalid post status"); allowed.status=status}
    const {data,error}=await supabaseCloudAdmin.from("marketing_posts").update(allowed).eq("id",id).eq("restaurant_id",restaurantId).select("*").single()
    if(error) throw error
    return NextResponse.json({success:true,post:data})
  }catch(e){return NextResponse.json({success:false,error:e.message||"Unable to update post"},{status:400})}
}
