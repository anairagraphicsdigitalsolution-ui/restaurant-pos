import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { rateLimit, rateLimitResponse } from "@/lib/publicRateLimit"

export const runtime = "nodejs"

export async function GET(req){
  const limit = rateLimit(req, "website-context", 120)
  if (!limit.ok) return rateLimitResponse(limit)
  try{
    const slug=new URL(req.url).searchParams.get("slug")?.trim()
    if(!slug)return Response.json({success:false,error:"Restaurant slug required"},{status:400})
    const {data:restaurant,error}=await supabaseCloudAdmin.from("restaurants")
      .select("id,name,slug,logo,description,cuisine,gst_enabled,gst_rate")
      .eq("slug",slug).maybeSingle()
    if(error||!restaurant)return Response.json({success:false,error:"Restaurant not found"},{status:404})
    const {data:menu}=await supabaseCloudAdmin.from("menu_items")
      .select("id,name,price,category,image,description,active,item_type,combo_config")
      .eq("restaurant_id",restaurant.id).eq("active",true)
      .order("category").order("name")
    const [{data:plugin},{data:settings},{data:offers}] = await Promise.all([
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id",restaurant.id).eq("plugin_code","offers").maybeSingle(),
      supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id",restaurant.id).eq("plugin_code","offers").maybeSingle(),
      supabaseCloudAdmin.from("offers").select("*").eq("restaurant_id",restaurant.id).eq("active",true)
    ])
    const masterEnabled=plugin?.enabled===true
    const offersEnabled=masterEnabled && settings?.config?.offers_enabled!==false
    const combosEnabled=masterEnabled && settings?.config?.combos_enabled!==false
    const visibleMenu=combosEnabled ? (menu||[]) : (menu||[]).filter(item=>item?.item_type!=="combo")
    return Response.json({success:true,restaurant,menu:visibleMenu,offers:offersEnabled?(offers||[]):[],offers_combos:{enabled:masterEnabled,offers_enabled:offersEnabled,combos_enabled:combosEnabled}},{
      headers:{"Cache-Control":"public,max-age=30,stale-while-revalidate=60"}
    })
  }catch(e){
    return Response.json({success:false,error:"Unable to load website ordering"},{status:500})
  }
}
