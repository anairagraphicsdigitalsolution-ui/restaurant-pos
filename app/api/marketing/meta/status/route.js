import {NextResponse} from "next/server"
import {requireApiUser} from "@/lib/serverAuth"
import {requireSuperAdmin} from "@/lib/serverStaffPermissions"
import {getMetaServerConfig} from "@/lib/marketingConfig"
export const runtime="nodejs"
export async function GET(req){try{const user=await requireApiUser(req);await requireSuperAdmin(user);const c=await getMetaServerConfig();const redirectUri=c.redirectUri||new URL("/api/marketing/meta/oauth/callback",req.url).toString();return NextResponse.json({success:true,configured:Boolean(c.appId&&c.appSecret),meta_app_id_configured:Boolean(c.appId),meta_app_secret_configured:Boolean(c.appSecret),redirect_uri:redirectUri,graph_version:c.graphVersion,scopes:c.scopes})}catch(e){return NextResponse.json({success:false,error:e.message},{status:403})}}
