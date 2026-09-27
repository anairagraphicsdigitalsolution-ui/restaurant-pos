import {NextResponse} from "next/server"
import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {rateLimit,rateLimitResponse} from "@/lib/publicRateLimit"
export const runtime="nodejs"
export async function POST(req){const l=rateLimit(req,"p2-3-kiosk-heartbeat",30);if(!l.ok)return rateLimitResponse(l);try{const b=await req.json();const code=String(b.kiosk_code||"").trim();if(!code)throw new Error("kiosk_code required");const {data,error}=await supabaseCloudAdmin.from("p2_3_kiosks").update({status:"active",version:String(b.version||"1.0.0"),menu_version:String(b.menu_version||""),last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("kiosk_code",code).in("status",["active","offline"]).select("id").maybeSingle();if(error)throw error;if(!data)throw new Error("Kiosk not found");return NextResponse.json({success:true})}catch(e){return NextResponse.json({success:false,error:e.message},{status:400})}}
