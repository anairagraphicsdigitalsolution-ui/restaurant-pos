import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { testPlugin, sanitizeConfigForClient } from "@/lib/pluginRuntime"

export const runtime="nodejs"

async function authContext(req,restaurantId){
  const user=await requireApiUser(req)
  const {data:profile,error}=await supabaseAdmin.from("profiles").select("id,role,restaurant_id")
    .eq("id",user.id).maybeSingle()
  if(error||!profile) throw new Error("Profile not found")
  if(!["admin","super_admin"].includes(profile.role)) throw new Error("Not authorized")
  if(profile.role!=="super_admin" && profile.restaurant_id!==restaurantId) throw new Error("Not authorized for this restaurant")
  return profile
}

export async function POST(req){
  try{
    const body=await req.json()
    const restaurantId=String(body?.restaurant_id||"").trim()
    const pluginCode=String(body?.plugin_code||"").trim()
    if(!restaurantId||!pluginCode) return NextResponse.json({success:false,error:"restaurant_id and plugin_code are required"},{status:400})
    await authContext(req,restaurantId)
    const {data:settings,error}=await supabaseAdmin.from("plugin_settings").select("config")
      .eq("restaurant_id",restaurantId).eq("plugin_code",pluginCode).maybeSingle()
    if(error) throw error
    const result=await testPlugin({restaurantId,pluginCode,config:settings?.config||{}})
    return NextResponse.json({success:true,plugin_code:pluginCode,result,config:sanitizeConfigForClient(settings?.config||{})})
  }catch(e){
    console.error("PLUGIN TEST ERROR",e)
    return NextResponse.json({success:false,error:e?.message||"Plugin connection test failed"},{status:400})
  }
}
