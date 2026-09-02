import {NextResponse} from "next/server"
import {supabaseCloudAdmin} from "@/lib/supabaseCloudServer"
import {requireApiUser} from "@/lib/serverAuth"
import {requireSuperAdmin} from "@/lib/serverStaffPermissions"
export const runtime="nodejs"
export async function GET(req){try{await requireSuperAdmin(await requireApiUser(req));const {data,error}=await supabaseCloudAdmin.from("profiles").select("id,email,role").in("role",["super_admin","admin","staff"]).order("email");if(error)throw error;return NextResponse.json({success:true,assignees:data||[]})}catch(e){return NextResponse.json({success:false,error:e.message},{status:403})}}
