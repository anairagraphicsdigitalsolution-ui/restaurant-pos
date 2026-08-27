import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { PLUGIN_CATALOG } from "@/lib/pluginCatalog"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, restaurant_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) return Response.json({ success:false,error:"Profile not found" },{status:403})
    if (!["admin","super_admin"].includes(profile.role)) return Response.json({success:false,error:"Not authorized"},{status:403})

    const requested=String(new URL(req.url).searchParams.get("restaurant_id")||"").trim()
    const isSuperAdmin = profile.role === "super_admin"
    const restaurantId=isSuperAdmin ? requested : profile.restaurant_id

    // Super Admin has unrestricted access to the saleable plugins even when
    // no restaurant is selected. Restaurant users still require their own
    // restaurant context and plugin row.
    if (isSuperAdmin && !restaurantId) {
      const data=PLUGIN_CATALOG.map(c=>({
        ...c,
        installed:null,
        active:true,
        access_scope:"super_admin"
      }))
      return Response.json({success:true,data,is_super_admin:true,restaurant_id:null})
    }

    if(!restaurantId) return Response.json({success:false,error:"restaurant_id is required"},{status:400})
    if(!isSuperAdmin && restaurantId!==profile.restaurant_id) return Response.json({success:false,error:"Not authorized"},{status:403})

    const {data:installed,error}=await supabaseAdmin.from("restaurant_plugins").select("*")
      .eq("restaurant_id",restaurantId).order("plugin_code")
    if(error) throw error

    const data=PLUGIN_CATALOG.map(c=>({
      ...c,
      installed:installed?.find(x=>x.plugin_code===c.code)||null,
      active:installed?.some(x=>x.plugin_code===c.code && x.enabled===true)===true,
      access_scope:isSuperAdmin ? "super_admin" : "restaurant"
    }))
    return Response.json({success:true,data})
  }catch(error){
    console.error("PLUGIN LIST ERROR:",error)
    return Response.json({success:false,error:error?.message||"Unable to load plugins"},{status:500})
  }
}
