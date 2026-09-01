import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)

    const { data: profile, error: profileError } = await supabaseCloudAdmin
      .from("profiles")
      .select("restaurant_id,role")
      .eq("id", user.id)
      .maybeSingle()

    // Profiles created before the current Super Admin flow may not have
    // restaurant_id populated even though the auth user has the restaurant
    // metadata written at account creation time. Resolve both paths.
    const metadataRestaurantId = user.user_metadata?.restaurant_id || null
    const rid = profile?.restaurant_id || metadataRestaurantId

    if (profileError || !rid) {
      return Response.json(
        { success: false, error: "Restaurant not found for user" },
        { status: 403 }
      )
    }

    const { data: orders, error: ordersError } = await supabaseCloudAdmin
      .from("orders")
      .select("*")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })

    if (ordersError) {
      return Response.json(
        { success: false, error: ordersError.message },
        { status: 400 }
      )
    }

    const orderIds = (orders || []).map(order => order.id).filter(Boolean)

    const [
      { data: tables },
      { data: rooms },
      { data: orderItems },
      { data: menuItems }
    ] = await Promise.all([
      supabaseCloudAdmin
        .from("tables")
        .select("id,table_number")
        .eq("restaurant_id", rid),
      supabaseCloudAdmin
        .from("rooms")
        .select("id,room_number")
        .eq("restaurant_id", rid),
      orderIds.length
        ? supabaseCloudAdmin
            .from("order_items")
            .select("*")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [] }),
      supabaseCloudAdmin
        .from("menu_items")
        .select("id,name")
        .eq("restaurant_id", rid)
    ])

    const tableMap = Object.fromEntries((tables || []).map(t => [t.id, t.table_number]))
    const roomMap = Object.fromEntries((rooms || []).map(r => [r.id, r.room_number]))
    const menuMap = Object.fromEntries((menuItems || []).map(m => [m.id, m.name]))

    const result = (orders || []).map(order => {
      const items = (orderItems || [])
        .filter(item => item.order_id === order.id)
        .map(item => ({
          ...item,
          name: item.item_name || menuMap[item.item_id] || "Item"
        }))

      let display = order.source_label || "Order"

      if (!order.source_label) {
        if (order.source_type === "table") {
          display = `🪑 Table ${tableMap[order.source_id] || order.source_id || "—"}`
        } else if (order.source_type === "room") {
          display = `🏨 Room ${roomMap[order.source_id] || order.source_id || "—"}`
        } else if (order.source_type === "delivery") {
          display = "🛵 Delivery"
        } else if (order.source_type === "takeaway") {
          display = "🥡 Takeaway"
        } else {
          display = "🧾 Order"
        }
      }

      return { ...order, display, items }
    })

    return Response.json({ success: true, orders: result })
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Unable to load kitchen orders" },
      { status: 401 }
    )
  }
}
