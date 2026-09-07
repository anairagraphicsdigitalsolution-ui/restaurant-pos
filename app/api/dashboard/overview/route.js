import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function dateKeyInIndia(value) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}
function todayIndiaKey() { return dateKeyInIndia(new Date()) }
function indiaDayStartIso(offsetDays = 0) {
  const now = new Date()
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const y = Number(parts.find(p => p.type === "year")?.value)
  const m = Number(parts.find(p => p.type === "month")?.value)
  const d = Number(parts.find(p => p.type === "day")?.value)
  const base = new Date(Date.UTC(y, m - 1, d - offsetDays, 0, 0, 0))
  return new Date(base.getTime() - 330 * 60 * 1000).toISOString()
}

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const rid = user.restaurant_id || null
    const resolvedRole = user.role || ""
    if (!rid) return Response.json({ success: false, error: "No restaurant is linked to this account" }, { status: 403 })

    const todayKey = todayIndiaKey()
    const dayStart = indiaDayStartIso(0)
    const tomorrowStart = indiaDayStartIso(-1)
    const sevenDaysStart = indiaDayStartIso(6)

    // The dashboard UI only renders the latest seven orders. Do not download
    // hundreds of historical orders merely to calculate summary cards; those
    // summaries are calculated from today's complete order set instead.
    const [restaurantRes, todayOrdersRes, recentOrdersRes, itemsRes, offersRes, customersRes, reservationsRes, tablesRes] = await Promise.all([
      supabaseCloudAdmin.from("restaurants").select("id,name,logo").eq("id", rid).single(),
      supabaseCloudAdmin.from("orders")
        .select("id,source_type,source_label,status,total_amount,subtotal,payment_status,created_at,billed_at,customer_id")
        .eq("restaurant_id", rid)
        .gte("created_at", dayStart)
        .lt("created_at", tomorrowStart)
        .order("created_at", { ascending: false }),
      supabaseCloudAdmin.from("orders")
        .select("id,source_type,source_label,status,total_amount,subtotal,payment_status,created_at,billed_at,customer_id")
        .eq("restaurant_id", rid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseCloudAdmin.from("menu_items").select("id,name,price,image,category").eq("restaurant_id", rid),
      supabaseCloudAdmin.from("offers").select("id,title,discount,valid_till,created_at").eq("restaurant_id", rid).order("created_at", { ascending: false }),
      supabaseCloudAdmin.from("customers").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
      supabaseCloudAdmin.from("reservations").select("id,name,phone,guests,date,time,status,table_id,created_at").eq("restaurant_id", rid).eq("date", todayKey).order("time", { ascending: true }),
      supabaseCloudAdmin.from("tables").select("id,table_number,seats").eq("restaurant_id", rid).order("table_number")
    ])

    const errors = {
      restaurant: restaurantRes.error?.message || null,
      orders: todayOrdersRes.error?.message || recentOrdersRes.error?.message || null,
      menu_items: itemsRes.error?.message || null,
      offers: offersRes.error?.message || null,
      customers: customersRes.error?.message || null,
      reservations: reservationsRes.error?.message || null,
      tables: tablesRes.error?.message || null
    }

    const todayOrders = todayOrdersRes.data || []
    const recentOrders = recentOrdersRes.data || []
    const cancelledStatuses = new Set(["cancelled", "canceled", "void", "voided", "refunded"])
    const validTodayOrders = todayOrders.filter(o => !cancelledStatuses.has(String(o.status || "").toLowerCase()))
    const todaySales = validTodayOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    const pendingOrders = validTodayOrders.filter(o => ["pending", "new"].includes(String(o.status || "").toLowerCase())).length
    const preparingOrders = validTodayOrders.filter(o => ["preparing", "in_kitchen", "in-kitchen"].includes(String(o.status || "").toLowerCase())).length
    const readyOrders = validTodayOrders.filter(o => String(o.status || "").toLowerCase() === "ready").length
    const completedOrders = validTodayOrders.filter(o => ["done", "completed", "served", "paid"].includes(String(o.status || "").toLowerCase())).length

    // Reporting is delegated to PostgreSQL. If the functions are not yet
    // migrated, the dashboard still works using a lightweight fallback query.
    let salesDays = []
    let topSelling = []
    const [salesRpc, topRpc] = await Promise.all([
      supabaseCloudAdmin.rpc("get_dashboard_sales_summary", { p_restaurant_id: rid, p_start: sevenDaysStart, p_end: tomorrowStart }),
      supabaseCloudAdmin.rpc("get_dashboard_top_items", { p_restaurant_id: rid, p_start: sevenDaysStart, p_end: tomorrowStart, p_limit: 6 })
    ])

    if (!salesRpc.error) {
      salesDays = salesRpc.data || []
    } else {
      errors.sales_summary = salesRpc.error.message
      const { data } = await supabaseCloudAdmin.from("orders")
        .select("created_at,total_amount,status")
        .eq("restaurant_id", rid)
        .gte("created_at", sevenDaysStart)
        .lt("created_at", tomorrowStart)
      const rows = data || []
      for (let offset = 6; offset >= 0; offset--) {
        const key = dateKeyInIndia(new Date(Date.now() - offset * 86400000))
        const valid = rows.filter(o => dateKeyInIndia(o.created_at) === key && !cancelledStatuses.has(String(o.status || "").toLowerCase()))
        salesDays.push({ day_key: key, total_sales: valid.reduce((s, o) => s + Number(o.total_amount || 0), 0), order_count: valid.length })
      }
    }
    if (!topRpc.error) {
      topSelling = topRpc.data || []
    } else {
      errors.top_items = topRpc.error.message
    }

    return Response.json({
      success: true,
      restaurant_id: rid,
      role: resolvedRole,
      restaurant: restaurantRes.data || null,
      orders: recentOrders,
      items: itemsRes.data || [],
      offers: offersRes.data || [],
      customers: [],
      reservations: reservationsRes.data || [],
      tables: tablesRes.data || [],
      orderItems: [],
      topSelling,
      salesDays,
      summary: {
        todayKey,
        todayOrderCount: validTodayOrders.length,
        todaySales,
        averageBill: validTodayOrders.length ? todaySales / validTodayOrders.length : 0,
        customerCount: Number(customersRes.count || 0),
        todayReservationCount: (reservationsRes.data || []).length,
        pendingOrders,
        preparingOrders,
        readyOrders,
        completedOrders,
      },
      errors
    })
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Dashboard data unavailable" }, { status: 401 })
  }
}
