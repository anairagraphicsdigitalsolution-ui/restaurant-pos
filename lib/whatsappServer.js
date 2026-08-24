import crypto from "crypto"
import { supabaseAdmin } from "@/lib/supabaseServer"

export async function getWhatsAppConfig(restaurantId) {
  const { data, error } = await supabaseAdmin
    .from("plugin_settings")
    .select("config")
    .eq("restaurant_id", restaurantId)
    .in("plugin_code", ["whatsapp-invoice", "whatsapp"])
    .order("plugin_code", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const saved = data?.config || {}
  const owner = saved.credential_owner || "restaurant"

  if (owner === "platform") {
    return {
      ...saved,
      provider: "meta-cloud",
      phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || saved.phone_number_id,
      access_token: process.env.WHATSAPP_ACCESS_TOKEN || saved.access_token,
      api_version: process.env.WHATSAPP_API_VERSION || saved.api_version || "v23.0",
      base_url: process.env.WHATSAPP_BASE_URL || saved.base_url || "https://graph.facebook.com",
    }
  }

  return {
    ...saved,
    provider: "meta-cloud",
    api_version: saved.api_version || "v23.0",
    base_url: saved.base_url || "https://graph.facebook.com",
  }
}

export function normalizeWhatsAppNumber(value) {
  return String(value || "").replace(/\D/g, "")
}

function requireConfig(config) {
  if (!config.phone_number_id) throw new Error("WhatsApp Phone Number ID is not configured.")
  if (!config.access_token) throw new Error("WhatsApp access token is not configured.")
}

function graphUrl(config) {
  requireConfig(config)
  const base = String(config.base_url || "https://graph.facebook.com").replace(/\/+$/, "")
  const version = String(config.api_version || "v23.0").replace(/^\/+|\/+$/g, "")
  return `${base}/${version}/${config.phone_number_id}/messages`
}

export async function sendWhatsAppMessage({ restaurantId, to, type = "template", templateName, language, templateParams = [], text, previewUrl = false }) {
  const config = await getWhatsAppConfig(restaurantId)
  requireConfig(config)

  const recipient = normalizeWhatsAppNumber(to)
  if (recipient.length < 8) throw new Error("Customer WhatsApp number is invalid.")

  let payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
  }

  if (type === "text") {
    if (config.allow_24h_text !== true) {
      throw new Error("Free-form text is disabled. Use an approved WhatsApp template for business-initiated messages.")
    }
    if (!String(text || "").trim()) throw new Error("WhatsApp text is empty.")
    payload = {
      ...payload,
      type: "text",
      text: { preview_url: Boolean(previewUrl), body: String(text) }
    }
  } else {
    const name = String(templateName || "").trim()
    if (!name) throw new Error("Approved WhatsApp template name is required.")
    const params = Array.isArray(templateParams) ? templateParams : []
    payload = {
      ...payload,
      type: "template",
      template: {
        name,
        language: { code: String(language || config.invoice_template_language || "en_US") },
        ...(params.length ? {
          components: [{
            type: "body",
            parameters: params.map(value => ({ type: "text", text: String(value ?? "") }))
          }]
        } : {})
      }
    }
  }

  const response = await fetch(graphUrl(config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  const raw = await response.text()
  let result
  try { result = JSON.parse(raw) } catch { result = { raw } }

  const wamid = result?.messages?.[0]?.id || null

  await supabaseAdmin.from("whatsapp_messages").insert({
    restaurant_id: restaurantId,
    direction: "outbound",
    recipient: recipient,
    message_type: payload.type,
    template_name: payload.template?.name || null,
    wamid,
    status: response.ok ? "accepted" : "failed",
    body: payload.text?.body || null,
    payload,
    response: result,
  }).then(() => {})

  if (!response.ok) {
    const detail = result?.error?.message || result?.error?.error_user_msg || raw || `WhatsApp API ${response.status}`
    throw new Error(detail)
  }

  return { success: true, wamid, result }
}

export async function verifyWhatsAppSignature(rawBody, signature, appSecret) {
  if (!appSecret) return true
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const a = Buffer.from(String(signature || ""))
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
