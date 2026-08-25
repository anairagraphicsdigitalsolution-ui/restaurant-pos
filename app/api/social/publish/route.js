import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

export const runtime="nodejs"

async function ctx(req){
  const user=await requireApiUser(req)
  const r=await resolveRestaurantForUser(user)
  if(!r.restaurantId)throw new Error("Restaurant not found")
  return r.restaurantId
}

export async function POST(req){
  try{
    const restaurantId=await ctx(req)
    const body=await req.json()
    const platform=String(body.platform||"").toLowerCase()
    if(!["facebook","instagram"].includes(platform))throw new Error("Unsupported social platform")

    const pluginCode = `${platform}-integration`
    const {data:plugin}=await supabaseAdmin.from("restaurant_plugins").select("enabled")
      .eq("restaurant_id",restaurantId).eq("plugin_code",pluginCode).maybeSingle()
    if (plugin?.enabled !== true) throw new Error(`${platform} integration plugin is not active for this restaurant`)
    const {data:settings}=await supabaseAdmin.from("plugin_settings")
      .select("config").eq("restaurant_id",restaurantId)
      .eq("plugin_code",pluginCode).maybeSingle()
    const cfg=settings?.config||{}
    if(!cfg.access_token||!cfg.account_id)throw new Error(`Configure ${platform} integration first`)

    const graph=String(cfg.base_url||"https://graph.facebook.com").replace(/\/+$/,"")
    const text=String(body.message||"").trim()
    if(!text)throw new Error("Post message is required")

    let url,form
    if(platform==="facebook"){
      url=`${graph}/${cfg.account_id}/feed`
      form=new URLSearchParams({message:text,access_token:cfg.access_token})
    }else{
      const imageUrl=String(body.image_url||"").trim()
      if(!imageUrl)throw new Error("Instagram requires a publicly reachable image URL")
      const create=await fetch(`${graph}/${cfg.account_id}/media`,{
        method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({image_url:imageUrl,caption:text,access_token:cfg.access_token})
      })
      const cd=await create.json()
      if(!create.ok||!cd.id)throw new Error(cd.error?.message||"Instagram media creation failed")
      const publish=await fetch(`${graph}/${cfg.account_id}/media_publish`,{
        method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({creation_id:cd.id,access_token:cfg.access_token})
      })
      const pd=await publish.json()
      if(!publish.ok)throw new Error(pd.error?.message||"Instagram publish failed")
      return NextResponse.json({success:true,platform,result:pd})
    }

    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form})
    const data=await response.json()
    if(!response.ok)throw new Error(data.error?.message||"Facebook publish failed")
    return NextResponse.json({success:true,platform,result:data})
  }catch(e){
    return NextResponse.json({success:false,error:e.message||"Social publish failed"},{status:400})
  }
}
