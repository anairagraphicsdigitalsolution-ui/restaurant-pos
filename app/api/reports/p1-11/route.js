import { requireStaffPermission } from "@/lib/serverStaffPermissions"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { requireFeature } from "@/lib/featureGateServer"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const restaurantId = url.searchParams.get("restaurant_id")
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 3650)
    if (!restaurantId) return NextResponse.json({ success:false, error:"restaurant_id is required" }, { status:400 })
    const auth = String(req.headers.get("authorization") || "")
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
    if (!token) return NextResponse.json({ success:false, error:"Authentication required" }, { status:401 })
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global:{ headers:{ Authorization:`Bearer ${token}` } }, auth:{ persistSession:false }
    })
    const { data:{ user }, error:userError } = await supabase.auth.getUser(token)
    if (userError || !user) return NextResponse.json({ success:false, error:"Invalid session" }, { status:401 })
    const resolved = await resolveRestaurantForUser(user)
    if (String(user?.app_metadata?.role || user?.role || "").toLowerCase() !== "super_admin" && resolved.restaurantId !== restaurantId) return NextResponse.json({ success:false, error:"Restaurant access denied" }, { status:403 })
    if (resolved.restaurantId) { await requireStaffPermission(user, resolved.restaurantId, "reports"); await requireFeature(resolved.restaurantId, "restaurant-pro") }
    const { data, error } = await supabase.rpc("p1_11_advanced_reporting", {
      p_restaurant_id: restaurantId,
      p_start: new Date(Date.now() - (days-1)*86400000).toISOString().slice(0,10),
      p_end: new Date().toISOString().slice(0,10)
    })
    if (error) throw error
    return NextResponse.json({ success:true, data })
  } catch (e) {
    return NextResponse.json({ success:false, error:e?.message || "Unable to load P1.11 analytics" }, { status:500 })
  }
}
