import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("restaurant_id,role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile?.restaurant_id) {
      return Response.json(
        { success:false, error:"Restaurant profile not found" },
        { status:403 }
      )
    }

    const rid = profile.restaurant_id

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

    const orders = ordersRes.data || []
    let orderItems = []

    if (orders.length) {
      const { data, error } = await supabaseAdmin
        .from("order_items")
        .select("id,order_id,item_id,quantity,line_total,item_name,unit_price")
        .in("order_id",orders.map(o=>o.id))

      if (error) errors.order_items = error.message
      orderItems = data || []
    }

    return Response.json({
      success:true,
      restaurant_id:rid,
      role:profile.role || "",
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
