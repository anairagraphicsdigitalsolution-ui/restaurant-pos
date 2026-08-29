import { requireApiUser } from "@/lib/serverAuth"
import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"
const TABLES = ["orders", "order_items", "kot_tickets", "customers", "inventory", "inventory_transactions", "restaurant_plugins", "plugin_settings", "reservations", "print_jobs", "invoice_sequences"]

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const { searchParams } = new URL(req.url)
    const restaurantId = String(searchParams.get("restaurant_id") || "").trim()
    const afterId = Number(searchParams.get("after_id") || 0)
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 200), 1), 500)
    if (!restaurantId) return Response.json({ success: false, error: "Restaurant is required" }, { status: 400 })
    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("restaurant_id,role").eq("id", user.id).maybeSingle()
    if (profileError) throw profileError
    if (profile?.role !== "super_admin" && profile?.restaurant_id !== restaurantId) return Response.json({ success: false, error: "Restaurant access denied" }, { status: 403 })
    const { data: events, error } = await supabaseAdmin.from("anaira_sync_events").select("id,source_node,schema_name,table_name,operation,primary_key,row_data,restaurant_id,changed_at,created_at").eq("restaurant_id", restaurantId).gt("id", afterId).in("table_name", TABLES).order("id", { ascending: true }).limit(limit)
    if (error) throw error
    const safeEvents = (events || []).filter(event => event.schema_name === "public" && TABLES.includes(event.table_name))
    const nextAfterId = safeEvents.length ? Number(safeEvents[safeEvents.length - 1].id) : afterId
    return Response.json({ success: true, events: safeEvents, next_after_id: nextAfterId })
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Cloud pull failed" }, { status: 400 })
  }
}
