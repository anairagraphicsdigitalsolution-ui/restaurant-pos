import {NextResponse} from "next/server"
import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {requireApiUser} from "@/lib/serverAuth"
import {requireStaffPermission} from "@/lib/serverStaffPermissions"
import {resolveRestaurantForUser} from "@/lib/restaurantResolver"
import {decryptMarketingToken,encryptMarketingToken} from "@/lib/marketingMeta"
export const runtime="nodejs"

async function ctx(req){
  const user=await requireApiUser(req)
  const r=await resolveRestaurantForUser(user)
  if(!r.restaurantId) throw new Error("Restaurant not found")
  await requireStaffPermission(user,r.restaurantId,"marketing")
  return {user,restaurantId:r.restaurantId}
}

export async function GET(req){
  try{
    const {user,restaurantId}=await ctx(req)
    const id=String(new URL(req.url).searchParams.get("session_id")||"")
    if(!id) throw new Error("Selection session is required")
    const {data,error}=await supabaseCloudAdmin.from("marketing_oauth_sessions")
      .select("id,platform,expires_at,candidates")
      .eq("id",id).eq("user_id",user.id).eq("restaurant_id",restaurantId)
      .gt("expires_at",new Date().toISOString()).maybeSingle()
    if(error) throw error
    if(!data) throw new Error("Meta selection session expired. Reconnect.")
    return NextResponse.json({success:true,...data,candidates:(data.candidates||[]).map(x=>({...x,access_token:undefined}))})
  }catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}
}

export async function POST(req){
  try{
    const {user,restaurantId}=await ctx(req)
    const b=await req.json()
    const sessionId=String(b.session_id||""),accountId=String(b.account_id||"")
    if(!sessionId||!accountId) throw new Error("OAuth selection is incomplete")
    const {data:s,error:se}=await supabaseCloudAdmin.from("marketing_oauth_sessions").select("*")
      .eq("id",sessionId).eq("user_id",user.id).eq("restaurant_id",restaurantId)
      .gt("expires_at",new Date().toISOString()).maybeSingle()
    if(se) throw se
    if(!s) throw new Error("Meta selection session expired. Reconnect.")
    const candidates=Array.isArray(s.candidates)?s.candidates:[]
    const selected=candidates.find(x=>String(x.id)===accountId || (s.platform==="instagram"&&String(x.instagram_business_account?.id)===accountId))
    if(!selected) throw new Error("Selected Meta account is not available in this authorization session")
    const ig=selected.instagram_business_account
    if(s.platform==="instagram"&&!ig) throw new Error("Selected Page has no Instagram Professional account")
    const targetId=s.platform==="instagram"?ig.id:selected.id
    const targetName=s.platform==="instagram"?(ig.username||ig.name):selected.name
    const targetImage=s.platform==="instagram"?(ig.profile_picture_url||selected.profile_image_url):selected.profile_image_url
    const token=decryptMarketingToken(selected.access_token)
    const code=`${s.platform}-integration`
    const {data:old}=await supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id",restaurantId).eq("plugin_code",code).maybeSingle()
    const cfg={...(old?.config||{}),account_id:targetId,account_name:targetName,profile_image_url:targetImage,access_token:encryptMarketingToken(token),oauth_provider:"meta",oauth_connected_at:new Date().toISOString(),meta_pages:candidates.map(({access_token,...safe})=>safe)}
    const {error:pe}=await supabaseCloudAdmin.from("plugin_settings").upsert({restaurant_id:restaurantId,plugin_code:code,config:cfg},{onConflict:"restaurant_id,plugin_code"})
    if(pe) throw pe
    const {data:connection,error:ce}=await supabaseCloudAdmin.from("marketing_connections").upsert({
      restaurant_id:restaurantId,platform:s.platform,account_id:targetId,account_name:targetName,profile_image_url:targetImage,status:"connected",
      encrypted_access_token:encryptMarketingToken(token),connected_at:new Date().toISOString(),token_expires_at:s.token_expires_at,
      selected_parent_id:selected.id,metadata:{source:"meta-oauth",page_id:selected.id,pages:candidates.map(p=>({id:p.id,name:p.name,instagram_business_account:p.instagram_business_account}))}
    },{onConflict:"restaurant_id,platform,account_id"}).select("id,platform,account_id,account_name,profile_image_url,status,token_expires_at,metadata").single()
    if(ce) throw ce
    await supabaseCloudAdmin.from("marketing_oauth_sessions").delete().eq("id",sessionId)
    return NextResponse.json({success:true,connection})
  }catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}
}
