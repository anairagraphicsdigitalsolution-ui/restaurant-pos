import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const resolved = await resolveRestaurantForUser(user)
    const requestedRestaurantId = new URL(req.url).searchParams.get("restaurant_id")
    const restaurantId = resolved.restaurantId

    if (!restaurantId || !requestedRestaurantId || String(restaurantId) !== String(requestedRestaurantId)) {
      return Response.json(
        { success: false, error: "Restaurant access denied" },
        { status: 403 }
      )
    }

    const { data: orders, error: ordersError } = await supabaseCloudAdmin
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(500)

    if (ordersError) {
      return Response.json(
        { success: false, error: ordersError.message },
        { status: 500 }
      )
    }

    const orderRows = orders || []
    const orderIds = orderRows.map(order => order.id).filter(Boolean)

    if (!orderIds.length) {
      return Response.json({
        success: true,
        orders: [],
        paymentRows: [],
        refundRows: [],
        orderItems: [],
        modifierRows: [],
        menuRows: []
      })
    }

    const [paymentsRes, refundsRes, itemsRes] = await Promise.all([
      supabaseCloudAdmin
        .from("order_payments")
        .select("id,order_id,payment_method,amount,status,reference,paid_at,created_at")
        .in("order_id", orderIds),
      supabaseCloudAdmin
        .from("order_refunds")
        .select("id,order_id,amount,status,created_at")
        .in("order_id", orderIds),
      supabaseCloudAdmin
        .from("order_items")
        .select("id,order_id,item_id,item_name,unit_price,quantity,line_total")
        .in("order_id", orderIds)
    ])

    const orderItems = itemsRes.data || []
    const orderItemIds = orderItems.map(item => item.id).filter(Boolean)
    const itemIds = [...new Set(orderItems.map(item => item.item_id).filter(Boolean))]

    const [modifiersRes, menuRes] = await Promise.all([
      orderItemIds.length
        ? supabaseCloudAdmin
            .from("order_item_modifiers")
            .select("order_item_id,modifier_name,price,quantity")
            .in("order_item_id", orderItemIds)
        : Promise.resolve({ data: [], error: null }),
      itemIds.length
        ? supabaseCloudAdmin
            .from("menu_items")
            .select("id,name,price,category")
            .in("id", itemIds)
        : Promise.resolve({ data: [], error: null })
    ])

    const errors = [
      paymentsRes.error,
      refundsRes.error,
      itemsRes.error,
      modifiersRes.error,
      menuRes.error
    ].filter(Boolean)

    if (errors.length) {
      console.error("Billing analytics supporting query error:", errors.map(e => e.message))
    }

    return Response.json({
      success: true,
      restaurant_id: restaurantId,
      orders: orderRows,
      paymentRows: paymentsRes.data || [],
      refundRows: refundsRes.data || [],
      orderItems,
      modifierRows: modifiersRes.data || [],
      menuRows: menuRes.data || [],
      errors: errors.map(error => error.message)
    })
  } catch (error) {
    console.error("Billing analytics API:", error)
    return Response.json(
      { success: false, error: error?.message || "Billing analytics unavailable" },
      { status: 401 }
    )
  }
}
