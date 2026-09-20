import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { getWhatsAppConfig, sendWhatsAppMessage } from "@/lib/whatsappServer"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

export const runtime = "nodejs"

async function context(req) {
  const user = await requireApiUser(req)
  const resolved = await resolveRestaurantForUser(user)
  if (!resolved.restaurantId) throw new Error("Restaurant profile not found")
  return { user, restaurantId: resolved.restaurantId }
}

function renderTemplate(template, data) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(data?.[key] ?? ""))
}

export async function POST(req) {
  try {
    const { restaurantId } = await context(req)
    const body = await req.json()
    const action = String(body.action || "template").trim()

    const { data: pluginRow, error: pluginError } = await supabaseCloudAdmin
    .from("restaurant_plugins")
    .select("enabled")
    .eq("restaurant_id", restaurantId)
    .in("plugin_code", ["whatsapp-invoice","whatsapp"])
    .order("plugin_code", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (pluginError) throw new Error(pluginError.message)
  if (pluginRow?.enabled !== true) throw new Error("WhatsApp plugin is not active for this restaurant.")

  const config = await getWhatsAppConfig(restaurantId)

  if (action === "invoice") {
      const bill = body.bill || {}
      const recipient = body.to || bill.customer_phone
      const values = [
        bill.customer_name || "Customer",
        bill.invoice_no || "",
        Number(bill.total_amount ?? bill.total ?? 0).toFixed(2)
      ]

      const result = await sendWhatsAppMessage({
        restaurantId,
        to: recipient,
        type: "template",
        templateName: body.templateName || config.invoice_template_name || "invoice_ready",
        language: body.language || config.invoice_template_language || "en_US",
        templateParams: values
      })
      return NextResponse.json(result)
    }

    if (action === "order") {
      const order = body.order || {}
      const values = [
        order.customer_name || "Customer",
        order.order_no || order.id || "",
        String(order.status || "confirmed")
      ]
      const result = await sendWhatsAppMessage({
        restaurantId,
        to: body.to || order.customer_phone,
        type: "template",
        templateName: body.templateName || config.order_template_name || "order_confirmation",
        language: body.language || config.invoice_template_language || "en_US",
        templateParams: values
      })
      return NextResponse.json(result)
    }

    if (action === "payment") {
      const payment = body.payment || {}
      const values = [
        payment.customer_name || "Customer",
        payment.invoice_no || "",
        Number(payment.amount || 0).toFixed(2),
        payment.method || "payment"
      ]
      const result = await sendWhatsAppMessage({
        restaurantId,
        to: body.to || payment.customer_phone,
        type: "template",
        templateName: body.templateName || config.payment_template_name || "payment_receipt",
        language: body.language || config.invoice_template_language || "en_US",
        templateParams: values
      })
      return NextResponse.json(result)
    }

    if (action === "text") {
      const result = await sendWhatsAppMessage({
        restaurantId,
        to: body.to,
        type: "text",
        text: body.text,
        previewUrl: body.previewUrl
      })
      return NextResponse.json(result)
    }

    throw new Error("Unsupported WhatsApp action")
  } catch (e) {
    return NextResponse.json({ success:false, error:e?.message || "WhatsApp send failed" }, { status:400 })
  }
}
