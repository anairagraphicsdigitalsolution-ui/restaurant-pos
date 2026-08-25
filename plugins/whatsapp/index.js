function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "")
}

export function createLink(data = {}, config = {}) {
  const phone = cleanPhone(data.phone || config.number)
  if (phone.length < 10) throw new Error("Valid WhatsApp number is required")

  const text = String(data.message || "").trim()
  const url = `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`

  return {
    success: true,
    provider: "whatsapp-click-to-chat",
    phone,
    text,
    url,
  }
}

export async function send(data = {}, config = {}) {
  /*
   * Server-side plugin execution uses the real Meta Cloud API whenever the
   * restaurant/platform credentials are configured. If no API credentials
   * exist, we return a real wa.me click-to-chat URL instead of pretending
   * that a message was sent.
   */
  const restaurantId = data._restaurantId
  const to = cleanPhone(data.phone || data.to || config.number)

  if (restaurantId && config.phone_number_id && config.access_token) {
    const { sendWhatsAppMessage } = await import("../../lib/whatsappServer")

    const type = data.type === "text" ? "text" : "template"
    if (type === "text") {
      const result = await sendWhatsAppMessage({
        restaurantId,
        to,
        type: "text",
        text: String(data.message || data.text || ""),
        previewUrl: Boolean(data.previewUrl),
      })
      return { ...result, provider: "meta-cloud" }
    }

    const result = await sendWhatsAppMessage({
      restaurantId,
      to,
      type: "template",
      templateName: data.templateName || config.order_template_name || config.invoice_template_name,
      language: data.language || config.invoice_template_language || "en_US",
      templateParams: Array.isArray(data.templateParams) ? data.templateParams : [],
    })
    return { ...result, provider: "meta-cloud" }
  }

  const link = createLink(data, config)
  return {
    success: false,
    code: "WHATSAPP_CLOUD_API_NOT_CONFIGURED",
    provider: "whatsapp-click-to-chat",
    message: "WhatsApp Cloud API is not configured. No message was sent.",
    ...link
  }
}
