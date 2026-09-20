import { localDbEnabled } from "@/lib/localDb"
import { localSyncStatus, pullRestaurantToLocal } from "@/lib/localSync"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
export const runtime = "nodejs"
export async function GET() {
  return Response.json(await localSyncStatus())
}
export async function POST(req) {
  try {
    if (!localDbEnabled()) return Response.json({ success:false, error:"Local database is disabled" }, {status:503})
    const user = await requireApiUser(req)
    const body = await req.json().catch(() => ({}))

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("restaurant_id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      throw new Error(profileError.message)
    }

    const isSuperAdmin = profile?.role === "super_admin"
    const linkedRestaurantId =
      profile?.restaurant_id ||
      user.user_metadata?.restaurant_id ||
      user.app_metadata?.restaurant_id ||
      null

    const requestedRestaurantId =
      body?.restaurant_id ||
      linkedRestaurantId

    if (!requestedRestaurantId) {
      return Response.json(
        {success:false,error:"Restaurant not found"},
        {status:400}
      )
    }

    if (!isSuperAdmin && requestedRestaurantId !== linkedRestaurantId) {
      return Response.json(
        {success:false,error:"Restaurant access denied"},
        {status:403}
      )
    }

    const result = await pullRestaurantToLocal(requestedRestaurantId)
    return Response.json({success:true,...result,status:await localSyncStatus()})
  } catch (e) {
    return Response.json({success:false,error:e.message || "Local sync failed"},{status:400})
  }
}
