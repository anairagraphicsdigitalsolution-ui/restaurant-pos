import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"

function cleanText(value, max) {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text ? text.slice(0, max) : null
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    throw new Error("Invalid order items")
  }

  return items.map((item, index) => {
    const itemId = cleanText(item?.item_id, 80)
    const quantity = Number(item?.quantity)

    if (!itemId || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new Error(`Invalid item at position ${index + 1}`)
    }

    return {
      item_id: itemId,
      quantity,
      cooking_request: cleanText(item?.cooking_request, 500),
      combo_selection: Array.isArray(item?.combo_selection) ? item.combo_selection.slice(0, 20).map(row => ({ item_id: cleanText(row?.item_id, 80) })).filter(row => row.item_id) : []
    }
  })
}

export async function POST(req) {
  try {
    const body = await req.json()

    const slug = cleanText(body?.slug, 120)
    const type = cleanText(body?.source_type, 20)?.toLowerCase()
    const sourceId = cleanText(body?.source_id, 80)
    const overallNote = cleanText(body?.overall_note, 1000)
    const offerId = cleanText(body?.offer_id, 80)
    const items = normalizeItems(body?.items)

    if (!slug || !sourceId || !["table", "room"].includes(type)) {
      return Response.json(
        { success: false, error: "Invalid QR order data" },
        { status: 400 }
      )
    }

    // The database RPC performs the authoritative restaurant/source/menu
    // validation and calculates prices from menu_items. The client never
    // supplies price, restaurant_id, or source_label.
    const { data: orderResult, error: orderError } =
      await supabaseAdmin.rpc("create_public_qr_order", {
        p_slug: slug,
        p_type: type,
        p_source_id: sourceId,
        p_items: items,
        p_overall_note: overallNote,
        p_offer_id: offerId
      })

    if (orderError) {
      console.error("QR ORDER ERROR:", orderError)

      return Response.json(
        {
          success: false,
          error: orderError.message || "Order failed"
        },
        { status: 400 }
      )
    }

    const orderId = orderResult?.order_id
    let whatsappUrl = null

    /*
     * ============================================================
     * WHATSAPP PLAN CHECK
     * ============================================================
     *
     * WhatsApp URL will only be generated if the restaurant's
     * active subscription allows the "whatsapp" feature.
     *
     * The order itself is NOT blocked.
     */
    if (orderId && orderResult?.restaurant_id) {
      const { data: whatsappEnabled, error: featureError } =
        await supabaseAdmin.rpc("has_restaurant_plan_feature", {
          p_restaurant_id: orderResult.restaurant_id,
          p_plugin_code: "whatsapp"
        })

      if (featureError) {
        console.error(
          "WHATSAPP PLAN CHECK ERROR:",
          featureError
        )
      }

      // Only continue with WhatsApp generation when the plan allows it.
      if (whatsappEnabled === true) {
        const { data: settings, error: settingsError } =
          await supabaseAdmin
            .from("plugin_settings")
            .select("config")
            .eq("restaurant_id", orderResult.restaurant_id)
            .eq("plugin_code", "whatsapp")
            .maybeSingle()

        if (settingsError) {
          console.error(
            "WHATSAPP SETTINGS ERROR:",
            settingsError
          )
        }

        const number = String(
          settings?.config?.number || ""
        ).replace(/\D/g, "")

        if (number) {
          const { data: restaurant, error: restaurantError } =
            await supabaseAdmin
              .from("restaurants")
              .select("name")
              .eq("id", orderResult.restaurant_id)
              .maybeSingle()

          if (restaurantError) {
            console.error(
              "RESTAURANT FETCH ERROR:",
              restaurantError
            )
          }

          const { data: orderItems, error: orderItemsError } =
            await supabaseAdmin
              .from("order_items")
              .select("item_name, quantity, line_total")
              .eq("order_id", orderId)
              .order("id")

          if (orderItemsError) {
            console.error(
              "ORDER ITEMS FETCH ERROR:",
              orderItemsError
            )
          }

          let message =
            `🧾 New Order - ${restaurant?.name || "Restaurant"}\n\n`

          message += `📍 ${orderResult.source_label}\n\n`
          message += "Items:\n"

          for (const item of orderItems || []) {
            message +=
              `- ${item.item_name || "Item"} x${item.quantity} = ₹${item.line_total || 0}\n`
          }

          message +=
            `\n💰 Subtotal: ₹${orderResult.subtotal || 0}`

          message +=
            `\n🎁 Offer Discount: ₹${orderResult.discount_amount || 0}`

          message +=
            `\n💵 Total: ₹${orderResult.total_amount || 0}`

          whatsappUrl =
            `https://wa.me/${number}?text=${encodeURIComponent(message)}`
        }
      }
    }

    return Response.json({
      success: true,
      order: orderResult,
      whatsapp_url: whatsappUrl
    })
  } catch (error) {
    console.error("QR ORDER ERROR:", error)

    return Response.json(
      {
        success: false,
        error: error.message || "Order failed"
      },
      { status: 400 }
    )
  }
}