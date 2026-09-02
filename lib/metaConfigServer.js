import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {decryptMarketingToken} from "@/lib/marketingMeta"

export async function getMetaServerConfig(){
  const {data,error}=await supabaseCloudAdmin.from("platform_marketing_settings").select("config").eq("setting_key","meta").maybeSingle()
  if(error) throw error
  const c=data?.config||{}
  return {
    appId:String(c.app_id||process.env.META_APP_ID||"").trim(),
    appSecret:c.app_secret_encrypted?decryptMarketingToken(c.app_secret_encrypted):String(process.env.META_APP_SECRET||"").trim(),
    redirectUri:String(c.redirect_uri||process.env.META_REDIRECT_URI||"").trim(),
    graphVersion:String(c.graph_version||process.env.META_GRAPH_VERSION||"v24.0").trim(),
    scopes:String(c.scopes||process.env.META_OAUTH_SCOPES||"pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,instagram_manage_insights,business_management").trim()
  }
}
