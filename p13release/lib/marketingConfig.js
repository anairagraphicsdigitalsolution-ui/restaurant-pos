import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {decryptMarketingToken,encryptMarketingToken} from "@/lib/marketingMeta"

export async function getMetaServerConfig(){
  const {data,error:rowError}=await supabaseCloudAdmin.from("platform_marketing_settings").select("config").eq("setting_key","meta").maybeSingle()
  if(rowError) throw rowError
  const c=data?.config||{}
  return {
    appId:String(c.app_id||process.env.META_APP_ID||"").trim(),
    appSecret:c.app_secret_encrypted?decryptMarketingToken(c.app_secret_encrypted):String(process.env.META_APP_SECRET||"").trim(),
    redirectUri:String(c.redirect_uri||process.env.META_REDIRECT_URI||"").trim(),
    graphVersion:String(c.graph_version||process.env.META_GRAPH_VERSION||"v24.0").trim(),
    scopes:String(c.scopes||process.env.META_OAUTH_SCOPES||"pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,instagram_manage_insights,business_management").trim(),
  }
}

export async function saveMetaServerConfig({appId,appSecret,redirectUri,graphVersion,scopes}){
  const config={
    app_id:String(appId||"").trim(),
    app_secret_encrypted:encryptMarketingToken(String(appSecret||"")),
    redirect_uri:String(redirectUri||"").trim(),
    graph_version:String(graphVersion||"v24.0").trim(),
    scopes:String(scopes||"").trim(),
    updated_at:new Date().toISOString(),
  }
  const {error}=await supabaseCloudAdmin.from("platform_marketing_settings").upsert({setting_key:"meta",config,updated_at:new Date().toISOString()},{onConflict:"setting_key"})
  if(error) throw error
}
