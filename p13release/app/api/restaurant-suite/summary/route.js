import { NextResponse } from "next/server"
import { requireApiUser, resolveRestaurantForUser } from "@/lib/serverAuth"
import { supabaseCloudServer } from "@/lib/supabaseCloudServer"

export const dynamic = "force-dynamic"

export async function GET(request) {
  try {
    const user = await requireApiUser(request)
    const rid = await resolveRestaurantForUser(user)
    if (!rid) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    const db = supabaseCloudServer()
    const queries = await Promise.all([
      db.from("restaurant_channels").select("id,display_name,active").eq("restaurant_id", rid),
      db.from("restaurant_virtual_brands").select("id,name,active").eq("restaurant_id", rid),
      db.from("restaurant_terminals").select("id,terminal_name,device_type").eq("restaurant_id", rid),
      db.from("restaurant_integrations").select("id,display_name,integration_type,provider,active").eq("restaurant_id", rid),
      db.from("restaurant_staff_shifts").select("id,status,shift_date").eq("restaurant_id", rid).order("shift_date", { ascending: false }).limit(10),
      db.from("restaurant_approval_requests").select("id,status,request_type").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(20),
      db.from("restaurant_menu_publications").select("id,channel_code,version,status,published_at").eq("restaurant_id", rid).order("created_at", { ascending: false }).limit(30),
      db.from("online_channels").select("id,channel_code,channel_name,active").eq("restaurant_id", rid),
    ])
    const firstError = queries.find(x => x.error)?.error
    if (firstError) throw firstError
    const [channels,brands,terminals,integrations,shifts,approvals,publications,online] = queries.map(x => x.data || [])
    return NextResponse.json({
      success: true,
      restaurant_id: rid,
      modules: {
        channels: { total: channels.length, active: channels.filter(x=>x.active).length },
        website: { configured: !!channels.find(x=>String(x.display_name||"").toLowerCase().includes("website") && x.active) },
        virtual_brands: { total: brands.length, active: brands.filter(x=>x.active).length },
        terminals: { total: terminals.length },
        staff: { shifts: shifts.length, pending_approvals: approvals.filter(x=>["pending","requested","open"].includes(String(x.status||"").toLowerCase())).length },
        menu: { publications: publications.length, latest: publications[0] || null },
        integrations: { total: integrations.length, active: integrations.filter(x=>x.active).length },
        aggregators: { total: online.length, active: online.filter(x=>x.active).length },
      },
      channels, brands, terminals, integrations, shifts, approvals, publications, online,
      payment_qr_separate: true,
    })
  } catch (e) {
    const status = /sign|auth|token|unauthor/i.test(e?.message || "") ? 401 : 500
    return NextResponse.json({ error: e?.message || "Unable to load Restaurant Suite" }, { status })
  }
}
