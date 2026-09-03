import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

export const dynamic = "force-dynamic"

export const runtime = "nodejs"

function dateKeyInIndia(value) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d)
}

function todayIndiaKey() {
  return dateKeyInIndia(new Date())
}

export async function GET(req) {
  try {
    const user = await requireApiUser(req)

    const resolved = await resolveRestaurantForUser(user)
    const rid = resolved.restaurantId
    const resolvedRole = resolved.role

    if (!rid) {
      return Response.json(
        { success:false, error:"No restaurant is linked to this account" },
        { status:403 }
      )
    }

    const [
      restaurantRes,
      ordersRes,
      itemsRes,
      offersRes,
      customersRes,
      reservationsRes,
      tablesRes
    ] = await Promise.all([
      supabaseCloudAdmin.from("restaurants").select("id,name,logo").eq("id",rid).single(),
      supabaseCloudAdmin.from("orders")
        .select("id,source_type,source_label,status,total_amount,subtotal,payment_status,created_at,billed_at,customer_id")
        .eq("restaurant_id",rid)
        .order("created_at",{ascending:false})
        .limit(250),
      supabaseCloudAdmin.from("menu_items")
        .select("id,name,price,image,category")
        .eq("restaurant_id",rid),
      supabaseCloudAdmin.from("offers")
        .select("id,title,discount,valid_till,created_at")
        .eq("restaurant_id",rid)
        .order("created_at",{ascending:false}),
      supabaseCloudAdmin.from("customers")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id",rid),
      supabaseCloudAdmin.from("reservations")
        .select("id,name,phone,guests,date,time,status,table_id,created_at")
        .eq("restaurant_id",rid)
        .eq("date", todayIndiaKey())
        .order("time",{ascending:true})
        .limit(100),
      supabaseCloudAdmin.from("tables")
        .select("id,table_number,seats")
        .eq("restaurant_id",rid)
        .order("table_number")
    ])

    const errors = {
      restaurant: restaurantRes.error?.message || null,
      orders: ordersRes.error?.message || null,
      menu_items: itemsRes.error?.message || null,
      offers: offersRes.error?.message || null,
      customers: customersRes.error?.message || null,
      reservations: reservationsRes.error?.message || null,
      tables: tablesRes.error?.message || null
    }

    let orders = ordersRes.data || []
    let orderItems = []

    if (orders.length) {
      const orderIds = orders.map(o => o.id)
      const { data, error } = await supabaseCloudAdmin
        .from("order_items")
        .select("id,order_id,item_id,quantity,item_name,unit_price,line_total")
        .in("order_id", orderIds)

      if (error) errors.order_items = error.message
      orderItems = data || []

      // Dashboard totals use the stored order total whenever available.
      // Do not load modifier rows here: they add a second potentially large
      // query and are not needed for the dashboard cards/top-selling list.
      const calculatedTotals = {}
      for (const item of orderItems) {
        const base =
          Number(item.line_total ?? 0) ||
          Number(item.unit_price || 0) * Number(item.quantity || 0)
        calculatedTotals[item.order_id] =
          (calculatedTotals[item.order_id] || 0) + base
      }

      orders = orders.map(order => {
        const stored = Number(order.total_amount || 0)
        const calculated = Number(calculatedTotals[order.id] || 0)
        const total = stored > 0 ? stored : calculated

        return total > 0
          ? { ...order, total_amount: total, subtotal: Number(order.subtotal || total) }
          : order
      })
    }

    const todayKey = todayIndiaKey()
    const cancelledStatuses = new Set(["cancelled","canceled","void","voided","refunded"])
    const todayOrders = orders.filter(order => {
      const status = String(order.status || "").toLowerCase()
      if (cancelledStatuses.has(status)) return false
      return dateKeyInIndia(order.created_at || order.billed_at) === todayKey
    })
    const todaySales = todayOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
    const pendingOrders = orders.filter(order => ["pending","new"].includes(String(order.status || "").toLowerCase())).length
    const preparingOrders = orders.filter(order => ["preparing","in_kitchen","in-kitchen"].includes(String(order.status || "").toLowerCase())).length
    const readyOrders = orders.filter(order => String(order.status || "").toLowerCase() === "ready").length
    const completedOrders = orders.filter(order => ["done","completed","served","paid"].includes(String(order.status || "").toLowerCase())).length

    // Customers should never silently become zero just because the customers
    // table is unavailable/incomplete. Fall back to unique customer IDs from orders.
    const customerIds = new Set(
      orders.map(order => order.customer_id).filter(Boolean).map(String)
    )
    // Dashboard only needs the count; never ship the entire customer table to the browser.
    const customerRows = []
    const customerCount = customersRes.error
      ? customerIds.size
      : Math.max(Number(customersRes.count || 0), customerIds.size)

    const todayReservations = (reservationsRes.data || []).filter(
      reservation => String(reservation.date || "").slice(0, 10) === todayKey
    )

    return Response.json({
      success:true,
      restaurant_id:rid,
      role:resolvedRole,
      restaurant:restaurantRes.data || null,
      orders,
      items:itemsRes.data || [],
      offers:offersRes.data || [],
      customers:customerRows,
      reservations:reservationsRes.data || [],
      tables:tablesRes.data || [],
      orderItems,
      summary: {
        todayKey,
        todayOrderCount: todayOrders.length,
        todaySales,
        averageBill: todayOrders.length ? todaySales / todayOrders.length : 0,
        customerCount,
        todayReservationCount: todayReservations.length,
        pendingOrders,
        preparingOrders,
        readyOrders,
        completedOrders
      },
      errors
    })
  } catch (error) {
    return Response.json(
      { success:false,error:error?.message || "Dashboard data unavailable" },
      { status:401 }
    )
  }
}
