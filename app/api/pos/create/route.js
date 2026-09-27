import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { requireFeature } from "@/lib/featureGateServer"
import { printOrderSlip } from "@/lib/orderSlipPrinter"
import { sourceNeedsLocation, sourceLabel } from "@/lib/orderEngine"

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
    const clientRequestId = cleanText(body?.idempotency_key || body?.client_request_id, 120)

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

    // Safe retry: mobile/offline/network retries can resend the same order.
    // The unique index in the additive migration makes this race-safe.
    if (clientRequestId) {
      const { data: existingOrder, error: existingError } = await supabaseCloudAdmin
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("client_request_id", clientRequestId)
        .maybeSingle()
      if (existingError) console.error("ORDER IDEMPOTENCY LOOKUP:", existingError)
      if (existingOrder) {
        return Response.json({
          success: true,
          order: existingOrder,
          duplicate: true,
          automation: { alreadyCreated: true }
        })
      }
    }

    /*
     * ============================================================
     * VERIFY SOURCE
     * ============================================================
     */

    let source = null
    if (sourceNeedsLocation(sourceType)) {
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

    const orderSourceLabel = sourceLabel({
      sourceType,
      source,
      customerName: cleanText(body?.customer_name, 120)
    })

    const { data: order, error: orderError } =
      await supabaseCloudAdmin
        .from("orders")
        .insert([
          {
            restaurant_id: restaurantId,
            client_request_id: clientRequestId,
            source_type: sourceType,
            source_id: sourceId || null,
            source_label: orderSourceLabel,
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
      if (clientRequestId) {
        const { data: racedOrder } = await supabaseCloudAdmin
          .from("orders")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("client_request_id", clientRequestId)
          .maybeSingle()
        if (racedOrder) {
          return Response.json({ success: true, order: racedOrder, duplicate: true, automation: { alreadyCreated: true } })
        }
      }
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

    // Batch menu/variant lookups. The old implementation performed one or
    // two network round trips per cart line (N+1). A busy POS should resolve
    // the whole cart in a handful of queries.
    const itemIds = [...new Set(items.map(item => cleanText(item?.item_id, 80)).filter(Boolean))]
    const variantIds = [...new Set(items.map(item => cleanText(item?.variant_id, 80)).filter(Boolean))]

    const [{ data: menuRows, error: menuError }, { data: variantRows, error: variantError }] = await Promise.all([
      supabaseCloudAdmin
        .from("menu_items")
        .select("id,name,price,item_type,restaurant_id")
        .eq("restaurant_id", restaurantId)
        .in("id", itemIds),
      variantIds.length
        ? supabaseCloudAdmin
            .from("menu_variants")
            .select("id,menu_item_id,name,price_delta,active,restaurant_id")
            .eq("restaurant_id", restaurantId)
            .in("id", variantIds)
            .eq("active", true)
        : Promise.resolve({ data: [], error: null })
    ])

    if (menuError) throw new Error(menuError.message)
    if (variantError) throw new Error(variantError.message)

    const menuMap = new Map((menuRows || []).map(row => [row.id, row]))
    const variantMap = new Map((variantRows || []).map(row => [row.id, row]))

    const orderItems = items.map((item, index) => {
      const itemId = cleanText(item?.item_id, 80)
      const menuItem = menuMap.get(itemId)
      if (!menuItem) throw new Error(`Menu item not found at position ${index + 1}`)

      const variantId = cleanText(item?.variant_id, 80)
      const variant = variantId ? variantMap.get(variantId) : null
      if (variantId && menuItem.item_type !== "combo" && !variant) {
        throw new Error(`Selected variant is unavailable at position ${index + 1}`)
      }
      if (variant && variant.menu_item_id !== menuItem.id) {
        throw new Error(`Selected variant does not belong to the menu item at position ${index + 1}`)
      }

      const effectivePrice = Number(menuItem.price || 0) + Number(variant?.price_delta || 0)
      if (effectivePrice < 0) throw new Error("Item price cannot be negative")

      const quantity = Number(item.quantity)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        throw new Error(`Invalid quantity at position ${index + 1}`)
      }

      const modifiers = Array.isArray(item?.selected_modifiers) ? item.selected_modifiers : []
      const modifierTotal = modifiers.reduce((sum, m) => sum + Number(m?.price || 0) * Number(m?.quantity || 1), 0)
      const variantName = variant?.name || null

      return {
        order_id: order.id,
        item_id: menuItem.id,
        variant_id: variantName ? variantId : null,
        variant_name: variantName,
        quantity,
        item_name: cleanText(variantName ? `${menuItem.name} — ${variantName}` : (item.item_name || item.name || menuItem.name), 200),
        unit_price: effectivePrice,
        line_total: (effectivePrice + modifierTotal) * quantity,
        cooking_request: cleanText(item.cooking_request, 500)
      }
    })

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

    // Persist server-authoritative totals. The client does not need to send
    // trusted prices, and running-order cards should never show ₹0 because a
    // client omitted subtotal/total fields.
    const serverSubtotal = orderItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0)
    const discount = Math.max(0, Number(body?.discount_amount || 0))
    const tax = Math.max(0, Number(body?.tax_amount || 0))
    const deliveryCharge = Math.max(0, Number(body?.delivery_charge || 0))
    const serverTotal = Math.max(0, serverSubtotal - discount + tax + deliveryCharge)
    const { data: authoritativeOrder, error: totalUpdateError } = await supabaseCloudAdmin
      .from("orders")
      .update({ subtotal: serverSubtotal, total_amount: serverTotal })
      .eq("id", order.id)
      .eq("restaurant_id", restaurantId)
      .select()
      .single()
    if (totalUpdateError) throw new Error(totalUpdateError.message)

    // Existing database trigger creates the persistent KOT. Printing is an
    // additional best-effort automation for POS orders; printer failure never
    // rolls back a valid restaurant order.
    let kotPrint = { attempted: false, printed: false }
    try {
      kotPrint = await printOrderSlip(order.id, restaurantId)
    } catch (printError) {
      console.error("POS KOT PRINT ERROR:", printError)
      kotPrint = { attempted: true, printed: false, reason: printError?.message || "Printer unavailable" }
    }

    return Response.json({ success: true, order: authoritativeOrder || { ...order, subtotal: serverSubtotal, total_amount: serverTotal }, automation: { kotCreated: true, kotPrint } })
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