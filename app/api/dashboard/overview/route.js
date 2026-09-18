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
    const [restaurantRes, todayOrdersRes, itemsRes, offersRes, customersRes, reservationsRes, tablesRes, topRpc] = await Promise.all([
      supabaseCloudAdmin.from("restaurants").select("id,name,logo").eq("id", rid).single(),
      supabaseCloudAdmin.from("orders")
        .select("id,source_type,source_label,status,total_amount,subtotal,payment_status,created_at,billed_at,customer_id")
        .eq("restaurant_id", rid)
        .gte("created_at", dayStart)
        .lt("created_at", tomorrowStart)
        .order("created_at", { ascending: false }),
      supabaseCloudAdmin.from("menu_items").select("id,name,price,image,category").eq("restaurant_id", rid).order("name").limit(250),
      supabaseCloudAdmin.from("offers").select("id,title,discount,valid_till,created_at").eq("restaurant_id", rid).eq("active", true).order("created_at", { ascending: false }).limit(50),
      supabaseCloudAdmin.from("customers").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
      supabaseCloudAdmin.from("reservations").select("id,name,phone,guests,date,time,status,table_id,created_at").eq("restaurant_id", rid).eq("date", todayKey).order("time", { ascending: true }).limit(100),
      supabaseCloudAdmin.from("tables").select("id,table_number,seats").eq("restaurant_id", rid).order("table_number").limit(200),
      supabaseCloudAdmin.rpc("get_dashboard_top_items", {
        p_restaurant_id: rid,
        p_start: dayStart,
        p_end: tomorrowStart,
        p_limit: 6,
      })
    ])

    const errors = {
      restaurant: restaurantRes.error?.message || null,
      orders: todayOrdersRes.error?.message || null,
      menu_items: itemsRes.error?.message || null,
      offers: offersRes.error?.message || null,
      customers: customersRes.error?.message || null,
      reservations: reservationsRes.error?.message || null,
      tables: tablesRes.error?.message || null
    }

    const todayOrders = todayOrdersRes.data || []
    const recentOrders = todayOrders.slice(0, 7)
    const cancelledStatuses = new Set(["cancelled", "canceled", "void", "voided", "refunded"])
    const validTodayOrders = todayOrders.filter(o => !cancelledStatuses.has(String(o.status || "").toLowerCase()))
    const todaySales = validTodayOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    const pendingOrders = validTodayOrders.filter(o => ["pending", "new"].includes(String(o.status || "").toLowerCase())).length
    const preparingOrders = validTodayOrders.filter(o => ["preparing", "in_kitchen", "in-kitchen"].includes(String(o.status || "").toLowerCase())).length
    const readyOrders = validTodayOrders.filter(o => String(o.status || "").toLowerCase() === "ready").length
    const completedOrders = validTodayOrders.filter(o => ["done", "completed", "served", "paid"].includes(String(o.status || "").toLowerCase())).length

    // Dashboard sales performance is TODAY-only and intentionally aggregated into
    // one business-day value. There is no hourly history loaded or rendered here.
    // Historical/day-wise analytics remain available in Reports.
    const salesToday = [{
      day_key: todayKey,
      label: "Today",
      total_sales: todaySales,
      order_count: validTodayOrders.length,
    }]

    // Compact, today-only business mix for the dashboard. The UI can use this
    // instead of loading/rendering historical or hourly sales data.
    const orderTypeMap = new Map()
    validTodayOrders.forEach((order) => {
      const rawType = String(order.source_type || order.source_label || "Other").trim()
      const key = rawType || "Other"
      const current = orderTypeMap.get(key) || { label: key, orders: 0, sales: 0 }
      current.orders += 1
      current.sales += Number(order.total_amount || 0)
      orderTypeMap.set(key, current)
    })
    const orderTypeBreakdown = Array.from(orderTypeMap.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 4)

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
      salesDays: salesToday,
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
        orderTypeBreakdown,
      },
      errors
    })
  } catch (error) {
    const message = error?.message || "Dashboard data unavailable"
    const lower = String(message).toLowerCase()
    const status = lower.includes("authentication required") || lower.includes("invalid or expired session")
      ? 401
      : lower.includes("timed out") || lower.includes("timeout") || lower.includes("fetch failed")
        ? 503
        : 500
    console.error("DASHBOARD OVERVIEW ERROR:", message)
    return Response.json({ success: false, error: message }, { status })
  }
}
