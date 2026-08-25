import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { validateExternalUrl } from "@/lib/pluginRuntime"

export const runtime="nodejs"

export async function POST(req){
 try{
  const user=await requireApiUser(req)
  const r=await resolveRestaurantForUser(user)
  if(!r.restaurantId)throw new Error("Restaurant not found")
  const body=await req.json()
  const printerCode=String(body.printer_code||"thermal-printing")
  const {data:plugin}=await supabaseAdmin.from("restaurant_plugins").select("enabled")
    .eq("restaurant_id",r.restaurantId).eq("plugin_code",printerCode).maybeSingle()
  if (plugin?.enabled !== true) throw new Error(`${printerCode} plugin is not active for this restaurant`)
  const {data:settings}=await supabaseAdmin.from("plugin_settings").select("config")
    .eq("restaurant_id",r.restaurantId).eq("plugin_code",printerCode).maybeSingle()
  const cfg=settings?.config||{}
  const bridge=validateExternalUrl(cfg.bridge_url, { allowPrivate: cfg.allow_private_bridge === true, requireHttps: cfg.allow_private_bridge !== true }).toString()
  const response=await fetch(bridge,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      printer:cfg.thermal||cfg.a4||cfg.queue||cfg.terminal||null,
      type:body.type||"receipt",
      content:body.content||"",
      data:body.data||{}
    })
  })
  const text=await response.text()
  let result=text;try{result=JSON.parse(text)}catch{}
  if(!response.ok)throw new Error(`Printer bridge ${response.status}: ${typeof result==="string"?result:JSON.stringify(result)}`)
  return NextResponse.json({success:true,result})
 }catch(e){
  return NextResponse.json({success:false,error:e.message||"Print request failed"},{status:400})
 }
}
