import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

export const runtime = "nodejs"

const ALLOWED = new Set(["swiggy","zomato"])

async function context(req, requireSuperAdmin=false){
  const user = await requireApiUser(req)
  const resolved = await resolveRestaurantForUser(user)
  if(!resolved.restaurantId) throw new Error("Restaurant profile not found")
  if(requireSuperAdmin){
    const {data:profile,error}=await supabaseAdmin.from("profiles").select("role").eq("id",user.id).maybeSingle()
    if(error) throw error
    if(profile?.role!=="super_admin") throw new Error("Super Admin access required")
  }
  return {user,restaurantId:resolved.restaurantId}
}

function safeProvider(v){
  const p=String(v||"").toLowerCase()
  if(!ALLOWED.has(p)) throw new Error("Unsupported aggregator")
  return p
}

export async function GET(req){
  try{
    const {restaurantId}=await context(req)
    const {data,error}=await supabaseAdmin
      .from("aggregator_integrations")
      .select("id,provider,outlet_code,active,last_sync_at,created_at")
      .eq("restaurant_id",restaurantId)
      .in("provider",["swiggy","zomato"])
    if(error) throw error
    return NextResponse.json({success:true,integrations:data||[]})
  }catch(e){
    return NextResponse.json({success:false,error:e.message||"Unable to load integrations"},{status:400})
  }
}

export async function POST(req){
  try{
    const {restaurantId}=await context(req,true)
    const body=await req.json()
    const provider=safeProvider(body.provider)
    const config=body.config||{}
    const outletCode=String(config.outlet_id||"").trim()
    if(!outletCode) throw new Error("Outlet / store ID is required")

    // Credentials are kept server-side in aggregator_integrations.credentials.
    const credentials={
      base_url:String(config.base_url||"").trim(),
      api_key:String(config.api_key||"").trim(),
      webhook_secret:String(config.webhook_secret||"").trim(),
      webhook_signature_header:String(config.webhook_signature_header||"x-webhook-signature").trim(),
      webhook_signature_algorithm:String(config.webhook_signature_algorithm||"sha256").trim(),
      webhook_signature_prefix:config.webhook_signature_prefix ?? "sha256="
    }
    const active=Boolean(credentials.base_url && credentials.api_key && credentials.webhook_secret)

    const {data,error}=await supabaseAdmin
      .from("aggregator_integrations")
      .upsert({
        restaurant_id:restaurantId,
        provider,
        outlet_code:outletCode,
        active,
        credentials
      },{onConflict:"restaurant_id,provider"})
      .select("id,provider,outlet_code,active,last_sync_at")
      .single()

    if(error) throw error
    return NextResponse.json({success:true,integration:data})
  }catch(e){
    return NextResponse.json({success:false,error:e.message||"Unable to save integration"},{status:400})
  }
}

// Generic real REST adapter. It performs an actual HTTP request to the
// configured partner endpoint and returns the partner's response.
// No fake "connected" result is produced.
export async function PUT(req){
  try{
    const {restaurantId}=await context(req)
    const body=await req.json()
    const provider=safeProvider(body.provider)
    const action=String(body.action||"").trim()

    const {data:integration,error}=await supabaseAdmin
      .from("aggregator_integrations")
      .select("*")
      .eq("restaurant_id",restaurantId)
      .eq("provider",provider)
      .eq("active",true)
      .maybeSingle()
    if(error) throw error
    if(!integration) throw new Error(`${provider} integration is not configured`)

    const credentials=integration.credentials||{}
    const base=String(credentials.base_url||"").replace(/\/+$/,"")
    if(!base) throw new Error(`${provider} base URL is not configured`)

    const paths={
      zomato:{
        get_menu:"/online-ordering/v3/menu/get",
        add_menu:"/online-ordering/v3/menu/add",
        stock:"/online-ordering/v3/menu/item/stock",
        confirm:"/online-ordering/v1/order/confirm",
        reject:"/online-ordering/v1/order/reject",
        ready:"/online-ordering/v1/order/ready",
        pickedup:"/online-ordering/v1/order/pickedup"
      }
    }

    // Swiggy partner endpoint paths are intentionally configurable because
    // current public Swiggy docs do not publish a restaurant-POS path set.
    const path=body.path || paths[provider]?.[action]
    if(!path) throw new Error(`No official ${provider} endpoint is configured for action "${action}"`)

    const url=String(path).startsWith("http")?String(path):`${base}${path}`
    const headers={"Content-Type":"application/json"}
    if(credentials.api_key) headers.Authorization=`Bearer ${credentials.api_key}`

    const response=await fetch(url,{
      method:body.method||"POST",
      headers,
      body:body.method==="GET"?"":JSON.stringify(body.payload||{})
    })

    const text=await response.text()
    let result=text
    try{result=JSON.parse(text)}catch{}

    if(!response.ok){
      throw new Error(`${provider} API ${response.status}: ${typeof result==="string"?result:JSON.stringify(result)}`)
    }

    await supabaseAdmin.from("aggregator_integrations")
      .update({last_sync_at:new Date().toISOString()})
      .eq("id",integration.id)

    return NextResponse.json({success:true,provider,action,result})
  }catch(e){
    return NextResponse.json({success:false,error:e.message||"Integration request failed"},{status:400})
  }
}
