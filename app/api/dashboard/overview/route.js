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

    // The dashboard UI only renders the latest seven orders. Do not download
    // hundreds of historical orders merely to calculate summary cards; those
    // summaries are calculated from today's complete order set instead.
    // Keep the dashboard payload small: cards need today's orders, the activity
    // list only needs a handful of recent orders, and the chart/top-items queries
    // run in parallel with the other reads.
    const [restaurantRes, todayOrdersRes, recentOrdersRes, itemsRes, offersRes, customersRes, reservationsRes, tablesRes, topRpc] = await Promise.all([
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
        .limit(7),
      supabaseCloudAdmin.from("menu_items").select("id,name,price,image,category").eq("restaurant_id", rid).order("name").limit(250),
      supabaseCloudAdmin.from("offers").select("id,title,discount,valid_till,created_at").eq("restaurant_id", rid).eq("active", true).order("created_at", { ascending: false }).limit(50),
      supabaseCloudAdmin.from("customers").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
      supabaseCloudAdmin.from("reservations").select("id,name,phone,guests,date,time,status,table_id,created_at").eq("restaurant_id", rid).eq("date", todayKey).order("time", { ascending: true }).limit(100),
      supabaseCloudAdmin.from("tables").select("id,table_number,seats").eq("restaurant_id", rid).order("table_number").limit(200),
      supabaseCloudAdmin.rpc("get_dashboard_top_items", {
        p_restaurant_id: rid,
        p_start: indiaDayStartIso(6),
        p_end: tomorrowStart,
        p_limit: 6,
      })
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

    // The dashboard sales chart is intentionally TODAY-only.
    // Build an hourly performance series from the complete India-time today order set.
    // This keeps the main dashboard focused on the current business day instead of
    // mixing the current shift with the previous six days.
    const salesByHour = Array.from({ length: 24 }, () => ({ total_sales: 0, order_count: 0 }))
    const indiaHourFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    })
    for (const order of validTodayOrders) {
      const date = new Date(order.created_at || order.billed_at)
      if (Number.isNaN(date.getTime())) continue
      const hour = Number(indiaHourFormatter.format(date)) % 24
      salesByHour[hour].total_sales += Number(order.total_amount || 0)
      salesByHour[hour].order_count += 1
    }
    const salesHours = salesByHour.map((row, hour) => ({
      day_key: `${todayKey}-${String(hour).padStart(2, "0")}`,
      hour,
      total_sales: row.total_sales,
      order_count: row.order_count,
    }))

    // Top-selling items are fetched in parallel with the dashboard reads above.
    let topSelling = []
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
      salesDays: salesHours,
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
