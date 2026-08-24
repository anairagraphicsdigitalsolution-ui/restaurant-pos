import { supabaseAdmin } from "@/lib/supabaseServer"
import { getWhatsAppConfig, normalizeWhatsAppNumber, sendWhatsAppMessage } from "@/lib/whatsappServer"

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
    const customerName = cleanText(body?.customer_name, 80)
    const customerPhone = normalizeWhatsAppNumber(body?.customer_phone)
    const offerId = cleanText(body?.offer_id, 80)
    const items = normalizeItems(body?.items)

    if (!slug || !sourceId || !["table", "room", "website"].includes(type)) {
      return Response.json(
        { success: false, error: "Invalid QR order data" },
        { status: 400 }
      )
    }

    // The database RPC performs the authoritative restaurant/source/menu
    // validation and calculates prices from menu_items. The client never
    // supplies price, restaurant_id, or source_label.
    const rpcName = type === "website"
      ? "create_public_website_order"
      : "create_public_qr_order"

    const { data: orderResult, error: orderError } =
      await supabaseAdmin.rpc(rpcName, {
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
    let customerWhatsappUrl = null
    let restaurantWhatsappUrl = null
    let whatsapp = { restaurantNotification: false, customerConfirmation: false }

    /*
     * WhatsApp is optional. The QR/website order itself is never blocked.
     * When the plugin is ON, the restaurant can:
     * 1) receive an actual Cloud API notification at a configured staff/owner
     *    WhatsApp recipient;
     * 2) send an actual Cloud API order confirmation to the customer's number;
     * 3) offer a customer-side wa.me fallback that opens WhatsApp with the
     *    complete order slip addressed to the restaurant.
     *
     * A browser cannot silently send a WhatsApp message from the customer's
     * personal account. The wa.me fallback therefore requires the customer's
     * tap/confirmation. The Cloud API messages are sent from the restaurant's
     * registered Business number.
     */
    if (orderId && orderResult?.restaurant_id) {
      const { data: pluginRow, error: pluginError } = await supabaseAdmin
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", orderResult.restaurant_id)
        .in("plugin_code", ["whatsapp-invoice", "whatsapp"])
        .order("plugin_code", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (pluginError) console.error("WHATSAPP PLUGIN CHECK:", pluginError)

      if (pluginRow?.enabled === true) {
        try {
          // Persist customer details without changing the core order RPC.
          if (customerName || customerPhone) {
            const { error: customerUpdateError } = await supabaseAdmin
              .from("orders")
              .update({
                ...(customerName ? { customer_name: customerName } : {}),
                ...(customerPhone ? { customer_phone: customerPhone } : {})
              })
              .eq("id", orderId)
            if (customerUpdateError) console.error("ORDER CUSTOMER UPDATE:", customerUpdateError)
          }

          const config = await getWhatsAppConfig(orderResult.restaurant_id)

          const { data: orderItems, error: orderItemsError } = await supabaseAdmin
            .from("order_items")
            .select("item_name, quantity, line_total")
            .eq("order_id", orderId)
            .order("id")

          if (orderItemsError) throw new Error(orderItemsError.message)

          const { data: restaurant, error: restaurantError } = await supabaseAdmin
            .from("restaurants")
            .select("name")
            .eq("id", orderResult.restaurant_id)
            .maybeSingle()

          if (restaurantError) throw new Error(restaurantError.message)

          const slipLines = [
            `🧾 New Order - ${restaurant?.name || "Restaurant"}`,
            `📍 ${orderResult.source_label || type}`,
            `🆔 ${orderId}`,
            "",
            "Items:",
            ...(orderItems || []).map(item =>
              `- ${item.item_name || "Item"} x${item.quantity} = ₹${item.line_total || 0}`
            ),
            "",
            `💰 Subtotal: ₹${orderResult.subtotal || 0}`,
            `🎁 Offer Discount: ₹${orderResult.discount_amount || 0}`,
            `💵 Total: ₹${orderResult.total_amount || 0}`,
            ...(customerName ? [`👤 ${customerName}`] : []),
            ...(customerPhone ? [`📱 ${customerPhone}`] : []),
            ...(overallNote ? [`📝 Note: ${overallNote}`] : [])
          ]
          const slip = slipLines.join("\n")

          // Customer -> restaurant: pre-filled WhatsApp chat.
          // This is intentionally a user-confirmed action, not a silent send.
          const restaurantRecipient = normalizeWhatsAppNumber(config.order_notification_recipient)
          if (restaurantRecipient && customerPhone) {
            restaurantWhatsappUrl =
              `https://wa.me/${restaurantRecipient}?text=${encodeURIComponent(slip)}`
          }

          // Restaurant -> staff/owner: actual Cloud API notification.
          if (config.send_qr_order_notification !== false && restaurantRecipient) {
            try {
              const result = await sendWhatsAppMessage({
                restaurantId: orderResult.restaurant_id,
                to: restaurantRecipient,
                type: "template",
                templateName: config.qr_order_template_name || "new_qr_order",
                language: config.invoice_template_language || "en_US",
                // Recommended Meta template:
                // {{1}} restaurant, {{2}} order id, {{3}} source,
                // {{4}} item summary, {{5}} total.
                templateParams: [
                  restaurant?.name || "Restaurant",
                  orderId,
                  orderResult.source_label || type,
                  (orderItems || []).map(item =>
                    `${item.item_name || "Item"} x${item.quantity}`
                  ).join(", ").slice(0, 900),
                  Number(orderResult.total_amount || 0).toFixed(2)
                ]
              })
              whatsapp.restaurantNotification = Boolean(result?.success)
            } catch (e) {
              console.error("WHATSAPP RESTAURANT ORDER NOTIFICATION:", e)
            }
          }

          // Restaurant -> customer: actual Cloud API confirmation.
          if (
            customerPhone &&
            config.send_order_confirmation !== false
          ) {
            try {
              const result = await sendWhatsAppMessage({
                restaurantId: orderResult.restaurant_id,
                to: customerPhone,
                type: "template",
                templateName: config.order_template_name || "order_confirmation",
                language: config.invoice_template_language || "en_US",
                templateParams: [
                  customerName || "Customer",
                  orderId,
                  String(orderResult.total_amount || 0)
                ]
              })
              whatsapp.customerConfirmation = Boolean(result?.success)
            } catch (e) {
              console.error("WHATSAPP CUSTOMER ORDER CONFIRMATION:", e)
            }
          }

          // Keep the legacy property name only as a compatibility alias.
          customerWhatsappUrl = restaurantWhatsappUrl
        } catch (e) {
          console.error("WHATSAPP QR ORDER FLOW:", e)
        }
      }
    }

    return Response.json({
      success: true,
      order: orderResult,
      whatsapp,
      restaurant_whatsapp_url: restaurantWhatsappUrl,
      customer_whatsapp_url: customerWhatsappUrl,
      whatsapp_url: restaurantWhatsappUrl
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