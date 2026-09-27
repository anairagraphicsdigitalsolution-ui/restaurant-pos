import {NextResponse} from "next/server"
import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {requireApiUser} from "@/lib/serverAuth"
import {resolveRestaurantForUser} from "@/lib/restaurantResolver"
import {requireStaffPermission} from "@/lib/serverStaffPermissions"
export const runtime="nodejs"
export async function GET(req,{params}){try{const u=await requireApiUser(req),r=await resolveRestaurantForUser(u);if(!r.restaurantId)throw new Error("Restaurant not found");await requireStaffPermission(u,r.restaurantId,"customers");const {data,error}=await supabaseCloudAdmin.rpc("phase4_customer_360",{p_customer_id:(await params).id});if(error)throw error;return NextResponse.json({success:true,profile:data})}catch(e){return NextResponse.json({success:false,error:e?.message||"Unable to load customer"},{status:400})}}
