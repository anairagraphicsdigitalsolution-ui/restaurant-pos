import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { requireFeature } from "@/lib/featureGateServer"

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
      !sourceId && ["table", "room"].includes(sourceType) ||
      !["table", "room", "takeaway", "delivery"].includes(sourceType)
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
      await supabaseCloudAdmin
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
     * RESTAURANT CORE ACCESS
     * ============================================================
     * Order creation is Core. Optional plugins must not block the base POS.
     */
    try {
      await requireFeature(restaurantId, "restaurant-core")
    } catch (featureError) {
      return Response.json({ success:false, error:featureError.message || "Restaurant Core is disabled" }, { status:403 })
    }

    /*
     * ============================================================
     * VERIFY SOURCE
     * ============================================================
     */

    let source = null
    if (sourceType === "table" || sourceType === "room") {
      const sourceTable = sourceType === "table" ? "tables" : "rooms"
      const { data, error: sourceError } = await supabaseCloudAdmin
        .from(sourceTable)
        .select("*")
        .eq("id", sourceId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle()
      if (sourceError || !data) {
        return Response.json({ success:false, error:sourceType === "table" ? "Table not found" : "Room not found" }, { status:400 })
      }
      source = data
    }

    const sourceLabel = sourceType === "table"
      ? `Table ${source.table_number}`
      : sourceType === "room"
        ? `Room ${source.room_number}`
        : sourceType === "delivery"
          ? `Delivery - ${cleanText(body?.customer_name, 120) || "Customer"}`
          : "Takeaway"

    const { data: order, error: orderError } =
      await supabaseCloudAdmin
        .from("orders")
        .insert([
          {
            restaurant_id: restaurantId,
            source_type: sourceType,
            source_id: sourceId || null,
            source_label: sourceLabel,
            marketing_source: cleanText(body?.marketing_source, 80) || null,
            marketing_campaign: cleanText(body?.marketing_campaign_id || body?.marketing_campaign, 160) || null,
            marketing_medium: cleanText(body?.marketing_medium, 80) || null,
            marketing_content: cleanText(body?.marketing_content, 160) || null,
            order_mode: sourceType === "table" || sourceType === "room" ? "dine_in" : sourceType,
            status: "pending",
            subtotal: Number(body?.subtotal || 0),
            discount_amount: Number(body?.discount_amount || 0),
            tax_amount: Number(body?.tax_amount || 0),
            delivery_charge: Number(body?.delivery_charge || 0),
            total_amount: Number(body?.total_amount || 0),
            payment_status: "unpaid",
            payment_method: sourceType === "delivery" ? cleanText(body?.payment_method, 30) : null,
            paid_amount: 0,
            customer_name: cleanText(body?.customer_name, 120),
            customer_phone: cleanText(body?.customer_phone, 30),
            delivery_address: cleanText(body?.delivery_address, 500),
            customer_note: cleanText(body?.customer_notes, 500)
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

    const orderItems = []
    for (const item of items) {
      const { data: menuItem, error: menuError } = await supabaseCloudAdmin.from("menu_items").select("id,name,price,item_type,restaurant_id").eq("id", item.item_id).eq("restaurant_id", restaurantId).maybeSingle()
      if (menuError || !menuItem) throw new Error("Menu item not found")
      let effectivePrice = Number(menuItem.price || 0)
      let variantName = null
      const variantId = cleanText(item?.variant_id, 80)
      if (variantId && menuItem.item_type !== "combo") {
        const { data: variant } = await supabaseCloudAdmin.from("menu_variants").select("id,name,price_delta,active").eq("id", variantId).eq("menu_item_id", menuItem.id).eq("restaurant_id", restaurantId).eq("active", true).maybeSingle()
        if (!variant) throw new Error("Selected variant is unavailable")
        effectivePrice += Number(variant.price_delta || 0); variantName = variant.name
      }
      if (effectivePrice < 0) throw new Error("Item price cannot be negative")
      const quantity = Number(item.quantity)
      const modifiers = Array.isArray(item?.selected_modifiers) ? item.selected_modifiers : []
      const modifierTotal = modifiers.reduce((sum,m)=>sum + Number(m?.price||0)*Number(m?.quantity||1),0)
      orderItems.push({ order_id: order.id, item_id: menuItem.id, variant_id: variantName ? variantId : null, variant_name: variantName, quantity, item_name: cleanText(variantName ? `${menuItem.name} — ${variantName}` : (item.item_name || item.name || menuItem.name),200), unit_price: effectivePrice, line_total: (effectivePrice + modifierTotal) * quantity, cooking_request: cleanText(item.cooking_request,500) })
    }

    const { data: insertedItems, error: itemError } =
      await supabaseCloudAdmin
        .from("order_items")
        .insert(orderItems)
        .select("id")

    if (itemError || !insertedItems || insertedItems.length !== orderItems.length) {
      console.error("POS ORDER ITEMS ERROR:", itemError)

      /*
       * Cleanup the order if order_items insertion fails.
       */

      await supabaseCloudAdmin
        .from("orders")
        .delete()
        .eq("id", order.id)
        .eq("restaurant_id", restaurantId)

      return Response.json(
        {
          success: false,
          error:
            itemError?.message ||
            "Unable to create order items"
        },
        { status: 400 }
      )
    }

    const modifierRows = []
    items.forEach((item, index) => {
      const mods = Array.isArray(item?.selected_modifiers) ? item.selected_modifiers : []
      for (const modifier of mods) {
        modifierRows.push({
          order_item_id: insertedItems[index].id,
          modifier_id: modifier.id || null,
          modifier_name: cleanText(modifier.name, 200) || "Modifier",
          price: Number(modifier.price || 0),
          quantity: Number(modifier.quantity || 1)
        })
      }
    })
    if (modifierRows.length) {
      const { error: modifierError } = await supabaseCloudAdmin.from("order_item_modifiers").insert(modifierRows)
      if (modifierError) {
        await supabaseCloudAdmin.from("orders").delete().eq("id", order.id).eq("restaurant_id", restaurantId)
        return Response.json({ success:false, error:modifierError.message || "Unable to create order modifiers" }, { status:400 })
      }
    }

    return Response.json({ success: true, order })
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