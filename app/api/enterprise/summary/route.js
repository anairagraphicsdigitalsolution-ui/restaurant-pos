import { requireApiUser } from "@/lib/serverAuth"
import { requireFeature } from "@/lib/featureGateServer"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { NextResponse } from "next/server"
export async function GET(req){try{const user=await requireApiUser(req);const id=new URL(req.url).searchParams.get("enterprise_id");if(!id)return NextResponse.json({success:false,error:"enterprise_id is required"},{status:400});const {data:member}=await supabaseCloudAdmin.from("enterprise_members").select("role").eq("enterprise_id",id).eq("user_id",user.id).maybeSingle();if(!member)return NextResponse.json({success:false,error:"Enterprise access denied"},{status:403});
    const {data:membershipRestaurant}=await supabaseCloudAdmin.from("enterprise_members").select("restaurant_id").eq("enterprise_id",id).eq("user_id",user.id).maybeSingle();
    if(membershipRestaurant?.restaurant_id) await requireFeature(membershipRestaurant.restaurant_id,"p1-enterprise-hq");const {data,error}=await supabaseCloudAdmin.rpc("phase7_enterprise_summary",{p_enterprise_id:id});if(error)throw error;return NextResponse.json({success:true,...data,role:member.role})}catch(e){const m=e?.message||"Unable to load enterprise summary";return NextResponse.json({success:false,error:m},{status:/Authentication|session|profile/i.test(m)?401:500})}}
