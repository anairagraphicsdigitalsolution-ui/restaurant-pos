import {NextResponse} from "next/server"
import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {requireApiUser} from "@/lib/serverAuth"
import {requireStaffPermission,requireSuperAdmin} from "@/lib/serverStaffPermissions"
import {resolveRestaurantForUser} from "@/lib/restaurantResolver"
import {decryptMarketingToken,metaGraphBase,isMarketingTokenExpired} from "@/lib/marketingMeta"

export const runtime="nodejs"

async function resolvePlatformMedia(b){
  const paths=Array.isArray(b.media_paths)?b.media_paths.filter(Boolean):(Array.isArray(b.metadata?.media_paths)?b.metadata.media_paths.filter(Boolean):[])
  if(!paths.length)return (Array.isArray(b.media_urls)?b.media_urls:[]).filter(Boolean)
  const urls=[]
  for(const path of paths){
    const {data,error}=await supabaseCloudAdmin.storage.from("platform-marketing-media").createSignedUrl(path,60*60)
    if(error)throw error
    urls.push(data.signedUrl)
  }
  return urls
}

async function resolveRestaurantMedia(b){
  const paths=Array.isArray(b.media_paths)?b.media_paths.filter(Boolean):[]
  if(!paths.length)return (Array.isArray(b.media_urls)?b.media_urls:[]).filter(Boolean)
  const urls=[]
  for(const path of paths){
    const {data,error}=await supabaseCloudAdmin.storage.from("restaurant-marketing-media").createSignedUrl(path,60*60)
    if(error)throw error
    urls.push(data.signedUrl)
  }
  return urls
}

async function waitInstagramContainer(id,token,{timeoutMs=45000,intervalMs=2500}={}){
  const deadline=Date.now()+timeoutMs
  while(Date.now()<deadline){
    const u=new URL(`${metaGraphBase()}/${id}`)
    u.searchParams.set("fields","status_code,status,status_code")
    u.searchParams.set("access_token",token)
    const r=await fetch(u)
    const d=await r.json().catch(()=>({}))
    if(!r.ok||d.error)throw new Error(d.error?.message||`Instagram container status failed (${r.status})`)
    const status=String(d.status_code||d.status||"").toUpperCase()
    if(["FINISHED","READY"].includes(status))return d
    if(["ERROR","EXPIRED","FAILED"].includes(status))throw new Error(d.status||d.status_code||"Instagram media processing failed")
    await new Promise(resolve=>setTimeout(resolve,intervalMs))
  }
  throw new Error("Instagram media is still processing. Please retry shortly.")
}

async function form(path,params){
  const res=await fetch(`${metaGraphBase()}/${path}`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params)})
  const d=await res.json().catch(()=>({}))
  if(!res.ok||d.error)throw new Error(d.error?.message||"Meta publishing failed")
  return d
}

export async function POST(req){
  let b={}
  let postId=null
  let scope="restaurant"
  let rid=null
  try{
    b=await req.json()
    const user=await requireApiUser(req)
    scope=String(b.scope||"restaurant").toLowerCase()

    if(scope!=="platform"){
      const r=await resolveRestaurantForUser(user)
      rid=r.restaurantId
      if(!rid)throw new Error("Restaurant not found")
    }

    const platform=String(b.platform||"").toLowerCase()
    const type=String(b.content_type||"text").toLowerCase()
    if(!["facebook","instagram"].includes(platform))throw new Error("WhatsApp uses approved template messaging")

    let token=""
    let accountId=""

    if(scope==="platform"){
      await requireSuperAdmin(user)
      const {data:conn}=await supabaseCloudAdmin.from("platform_marketing_connections").select("encrypted_access_token,account_id,status,token_expires_at").eq("platform",platform).eq("status","connected").order("updated_at",{ascending:false}).limit(1).maybeSingle()
      if(isMarketingTokenExpired(conn?.token_expires_at,120))throw new Error(`Reconnect platform ${platform}: Meta access token has expired or is expiring`)
      token=decryptMarketingToken(conn?.encrypted_access_token)
      accountId=conn?.account_id
    }else{
      if(!rid)throw new Error("Restaurant not found")
      await requireStaffPermission(user,rid,"marketing")
      const code=`${platform}-integration`
      const {data:plugin}=await supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id",rid).eq("plugin_code",code).maybeSingle()
      if(plugin?.enabled!==true)throw new Error(`${platform} plugin is not active`)
      const {data:conn}=await supabaseCloudAdmin.from("marketing_connections").select("encrypted_access_token,account_id,status,token_expires_at").eq("restaurant_id",rid).eq("platform",platform).eq("status","connected").order("updated_at",{ascending:false}).limit(1).maybeSingle()
      const {data:settings}=await supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id",rid).eq("plugin_code",code).maybeSingle()
      if(isMarketingTokenExpired(conn?.token_expires_at,120))throw new Error(`Reconnect ${platform}: Meta access token has expired or is expiring`)
      token=conn?.encrypted_access_token?decryptMarketingToken(conn.encrypted_access_token):decryptMarketingToken(settings?.config?.access_token)
      accountId=conn?.account_id||settings?.config?.account_id
    }

    if(!token||!accountId)throw new Error(`Connect ${platform} with Meta first`)

    postId=b.post_id?String(b.post_id):null

    if(postId){
      const table=scope==="platform"?"platform_marketing_posts":"marketing_posts"
      const claimPatch=scope==="platform"?{status:"publishing",error_message:null}:{status:"publishing",last_attempt_at:new Date().toISOString(),error_message:null}
      let q=supabaseCloudAdmin.from(table).update(claimPatch).eq("id",postId)
      if(scope!=="platform")q=q.eq("restaurant_id",rid)
      q=q.in("status",["draft","scheduled","failed"])
      const {data:claimed,error:claimError}=await q.select("id").maybeSingle()
      if(claimError)throw claimError
      if(!claimed)throw new Error("This post is already publishing or has already been published")
    }

    const caption=String(b.caption||b.message||"").trim()
    const media=scope==="platform"?await resolvePlatformMedia(b):await resolveRestaurantMedia(b)
    let result

    if(platform==="facebook"){
      if(media.length>1||type==="carousel"){
        const a=[]
        for(const url of media){
          const x=await form(`${accountId}/photos`,{url,published:"false",access_token:token})
          a.push(JSON.stringify({media_fbid:x.id}))
        }
        result=await form(`${accountId}/feed`,{message:caption,attached_media:a.join(","),access_token:token})
      }else if(media[0]){
        result=await form(`${accountId}/photos`,{url:media[0],caption,access_token:token})
      }else{
        result=await form(`${accountId}/feed`,{message:caption,access_token:token})
      }
    }else if(type==="reel"){
      const c=await form(`${accountId}/media`,{media_type:"REELS",video_url:String(b.video_url||media[0]||""),caption,share_to_feed:"true",access_token:token})
      await waitInstagramContainer(c.id,token)
      result=await form(`${accountId}/media_publish`,{creation_id:c.id,access_token:token})
    }else if(media.length>1||type==="carousel"){
      const ids=[]
      for(const url of media){
        const c=await form(`${accountId}/media`,{image_url:url,is_carousel_item:"true",access_token:token})
        ids.push(c.id)
      }
      const parent=await form(`${accountId}/media`,{media_type:"CAROUSEL",caption,children:ids.join(","),access_token:token})
      await waitInstagramContainer(parent.id,token)
      result=await form(`${accountId}/media_publish`,{creation_id:parent.id,access_token:token})
    }else{
      if(!media[0])throw new Error("Instagram image URL is required")
      const c=await form(`${accountId}/media`,{image_url:media[0],caption,access_token:token})
      await waitInstagramContainer(c.id,token)
      result=await form(`${accountId}/media_publish`,{creation_id:c.id,access_token:token})
    }

    if(postId){
      const table=scope==="platform"?"platform_marketing_posts":"marketing_posts"
      let q=supabaseCloudAdmin.from(table).update({status:"published",published_at:new Date().toISOString(),external_id:result?.id||null,next_retry_at:null,error_message:null}).eq("id",postId)
      if(scope!=="platform")q=q.eq("restaurant_id",rid)
      await q
    }

    return NextResponse.json({success:true,result})
  }catch(e){
    try{
      if(postId){
        const table=scope==="platform"?"platform_marketing_posts":"marketing_posts"
        let patch={status:"failed",error_message:e.message||"Publish failed",next_retry_at:new Date(Date.now()+15*60*1000).toISOString()}
        let q=supabaseCloudAdmin.from(table).update(patch).eq("id",postId)
        if(scope!=="platform"){
          const user=await requireApiUser(req)
          const rr=await resolveRestaurantForUser(user)
          if(rr.restaurantId)q=q.eq("restaurant_id",rr.restaurantId)
        }
        await q
      }
    }catch{}
    return NextResponse.json({success:false,error:e.message||"Publish failed"},{status:400})
  }
}
