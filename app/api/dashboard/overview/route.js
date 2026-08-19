import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)

    // Admin accounts in this project are linked to the restaurant through
    // restaurants.owner_id, while staff accounts are linked through profiles.
    // Resolve both paths so the dashboard never silently falls back to zeros.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("restaurant_id,role")
      .eq("id", user.id)
      .maybeSingle()

    let rid = profile?.restaurant_id || null
    let resolvedRole = profile?.role || ""

    if (!rid) {
      const { data: ownedRestaurant } = await supabaseAdmin
        .from("restaurants")
        .select("id")
        .eq("owner_id", user.id)
        .limit(1)
        .maybeSingle()

      rid = ownedRestaurant?.id || null
      if (rid && !resolvedRole) resolvedRole = "admin"
    }

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
      supabaseAdmin.from("restaurants").select("id,name,logo").eq("id",rid).single(),
      supabaseAdmin.from("orders")
        .select("id,source_type,source_label,status,total_amount,subtotal,payment_status,created_at,billed_at,customer_id")
        .eq("restaurant_id",rid)
        .order("created_at",{ascending:false}),
      supabaseAdmin.from("menu_items")
        .select("id,name,price,image,category")
        .eq("restaurant_id",rid),
      supabaseAdmin.from("offers")
        .select("id,title,discount,valid_till,created_at")
        .eq("restaurant_id",rid)
        .order("created_at",{ascending:false}),
      supabaseAdmin.from("customers")
        .select("id,name,phone,total_orders,total_spend,loyalty_points,updated_at")
        .eq("restaurant_id",rid)
        .order("updated_at",{ascending:false}),
      supabaseAdmin.from("reservations")
        .select("id,name,phone,guests,date,time,status,table_id,created_at")
        .eq("restaurant_id",rid)
        .order("created_at",{ascending:false})
        .limit(100),
      supabaseAdmin.from("tables")
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
      const { data, error } = await supabaseAdmin
        .from("order_items")
        .select("id,order_id,item_id,quantity,item_name,unit_price,line_total")
        .in("order_id", orderIds)

      if (error) errors.order_items = error.message
      orderItems = data || []

      const { data: modifierRows, error: modifierError } = await supabaseAdmin
        .from("order_item_modifiers")
        .select("order_item_id,price,quantity")
        .in("order_item_id", orderItems.map(item => item.id))

      if (modifierError) {
        errors.order_item_modifiers = modifierError.message
      }

      const modifierTotals = {}
      for (const row of modifierRows || []) {
        modifierTotals[row.order_item_id] =
          (modifierTotals[row.order_item_id] || 0) +
          Number(row.price || 0) * Number(row.quantity || 1)
      }

      const calculatedTotals = {}
      for (const item of orderItems) {
        const base =
          Number(item.line_total ?? 0) ||
          Number(item.unit_price || 0) * Number(item.quantity || 0)
        const modifierTotal =
          Number(modifierTotals[item.id] || 0) * Number(item.quantity || 0)

        calculatedTotals[item.order_id] =
          (calculatedTotals[item.order_id] || 0) + base + modifierTotal
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

    return Response.json({
      success:true,
      restaurant_id:rid,
      role:resolvedRole,
      restaurant:restaurantRes.data || null,
      orders,
      items:itemsRes.data || [],
      offers:offersRes.data || [],
      customers:customersRes.data || [],
      reservations:reservationsRes.data || [],
      tables:tablesRes.data || [],
      orderItems,
      errors
    })
  } catch (error) {
    return Response.json(
      { success:false,error:error?.message || "Dashboard data unavailable" },
      { status:401 }
    )
  }
}
