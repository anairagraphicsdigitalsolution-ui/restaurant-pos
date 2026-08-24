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
  // Without a WhatsApp Business API token, the reliable provider-neutral
  // operation is click-to-chat. The frontend can open the returned URL.
  return createLink(data, config)
}
