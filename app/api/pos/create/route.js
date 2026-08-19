import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

function cleanText(value, max) {
  if (typeof value !== "string") return null

  const text = value.trim()

  return text ? text.slice(0, max) : null
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json()

    const restaurantId = cleanText(body?.restaurant_id, 80)
    const sourceType = cleanText(body?.source_type, 20)?.toLowerCase()
    const sourceId = cleanText(body?.source_id, 80)
    const items = Array.isArray(body?.items) ? body.items : []

    if (
      !restaurantId ||
      !sourceId ||
      !["table", "room"].includes(sourceType)
    ) {
      return Response.json(
        {
          success: false,
          error: "Invalid POS order data"
        },
        { status: 400 }
      )
    }

    if (items.length < 1 || items.length > 50) {
      return Response.json(
        {
          success: false,
          error: "Cart is empty or invalid"
        },
        { status: 400 }
      )
    }

    /*
     * ============================================================
     * VERIFY LOGGED-IN USER
     * ============================================================
     */

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, role, restaurant_id")
        .eq("id", user.id)
        .maybeSingle()

    if (profileError || !profile) {
      return Response.json(
        {
          success: false,
          error: "Profile not found"
        },
        { status: 403 }
      )
    }

    /*
     * Super Admin can work with any restaurant.
     * Admin/staff must belong to the selected restaurant.
     */

    if (
      profile.role !== "super_admin" &&
      profile.restaurant_id !== restaurantId
    ) {
      return Response.json(
        {
          success: false,
          error: "Restaurant access denied"
        },
        { status: 403 }
      )
    }

    /*
     * ============================================================
     * POS PLAN FEATURE CHECK
     * ============================================================
     */

    const { data: posEnabled, error: planError } =
      await supabaseAdmin.rpc(
        "has_restaurant_plan_feature",
        {
          p_restaurant_id: restaurantId,
          p_plugin_code: "pos"
        }
      )

    if (planError) {
      console.error("POS PLAN CHECK ERROR:", planError)

      return Response.json(
        {
          success: false,
          error: "Unable to verify POS plan"
        },
        { status: 500 }
      )
    }

    if (posEnabled !== true) {
      return Response.json(
        {
          success: false,
          error: "POS is not available on your current plan"
        },
        { status: 403 }
      )
    }

    /*
     * ============================================================
     * VERIFY POS PLUGIN
     * ============================================================
     */

    const { data: plugin, error: pluginError } =
      await supabaseAdmin
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "pos")
        .maybeSingle()

    if (pluginError) {
      console.error("POS PLUGIN CHECK ERROR:", pluginError)

      return Response.json(
        {
          success: false,
          error: "Unable to verify POS plugin"
        },
        { status: 500 }
      )
    }

    if (!plugin?.enabled) {
      return Response.json(
        {
          success: false,
          error: "POS plugin is disabled"
        },
        { status: 403 }
      )
    }

    /*
     * ============================================================
     * VERIFY SOURCE
     * ============================================================
     */

    const sourceTable =
      sourceType === "table"
        ? "tables"
        : "rooms"

    const { data: source, error: sourceError } =
      await supabaseAdmin
        .from(sourceTable)
        .select("*")
        .eq("id", sourceId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle()

    if (sourceError || !source) {
      return Response.json(
        {
          success: false,
          error:
            sourceType === "table"
              ? "Table not found"
              : "Room not found"
        },
        { status: 400 }
      )
    }

    /*
     * ============================================================
     * CREATE ORDER
     * ============================================================
     */

    const sourceLabel =
      sourceType === "table"
        ? `Table ${source.table_number}`
        : `Room ${source.room_number}`

    const { data: order, error: orderError } =
      await supabaseAdmin
        .from("orders")
        .insert([
          {
            restaurant_id: restaurantId,
            source_type: sourceType,
            source_id: sourceId,
            source_label: sourceLabel,
            // Every fresh POS order must enter the kitchen queue first.
            // Kitchen moves it through preparing -> done.
            status: "pending"
          }
        ])
        .select()
        .single()

    if (orderError) {
      console.error("POS ORDER ERROR:", orderError)

      return Response.json(
        {
          success: false,
          error: orderError.message || "Unable to create order"
        },
        { status: 400 }
      )
    }

    /*
     * ============================================================
     * CREATE ORDER ITEMS
     * ============================================================
     */

    const orderItems = items.map((item) => ({
      order_id: order.id,
      item_id: item.item_id,
      quantity: Number(item.quantity)
    }))

    const { error: itemError } =
      await supabaseAdmin
        .from("order_items")
        .insert(orderItems)

    if (itemError) {
      console.error("POS ORDER ITEMS ERROR:", itemError)

      /*
       * Cleanup the order if order_items insertion fails.
       */

      await supabaseAdmin
        .from("orders")
        .delete()
        .eq("id", order.id)
        .eq("restaurant_id", restaurantId)

      return Response.json(
        {
          success: false,
          error:
            itemError.message ||
            "Unable to create order items"
        },
        { status: 400 }
      )
    }

    return Response.json({
      success: true,
      order
    })
  } catch (error) {
    console.error("POS CREATE ERROR:", error)

    return Response.json(
      {
        success: false,
        error: error?.message || "POS order failed"
      },
      { status: 401 }
    )
  }
}