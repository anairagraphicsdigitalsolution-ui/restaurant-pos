import crypto from "node:crypto"

const DEFAULT_HEADERS = {
  zomato: ["x-zomato-signature", "x-webhook-signature", "x-signature"],
  swiggy: ["x-swiggy-signature", "x-webhook-signature", "x-signature"],
}

function getHeader(headers, configured) {
  const names = [configured, ...(DEFAULT_HEADERS[configured?.toLowerCase()] || [])].filter(Boolean)
  for (const name of names) {
    const value = headers.get(name)
    if (value) return value.trim()
  }
  return ""
}

function stripPrefix(value, prefix) {
  if (!prefix) return value
  return value.toLowerCase().startsWith(prefix.toLowerCase()) ? value.slice(prefix.length).trim() : value
}

export function verifyAggregatorWebhook({ provider, rawBody, headers, credentials }) {
  const secret = String(credentials?.webhook_secret || "").trim()
  if (!secret) return { ok: false, status: 503, error: "Webhook secret is not configured yet" }

  const configuredHeader = String(credentials?.signature_header || "").trim().toLowerCase()
  const signatureHeader = configuredHeader || (provider === "zomato" ? "x-zomato-signature" : "x-swiggy-signature")
  const suppliedRaw = getHeader(headers, signatureHeader)
  if (!suppliedRaw) return { ok: false, status: 401, error: "Webhook signature is missing" }

  const algorithm = String(credentials?.signature_algorithm || "sha256").toLowerCase()
  if (!crypto.getHashes().includes(algorithm)) return { ok: false, status: 500, error: "Unsupported webhook signature algorithm" }
  const digest = crypto.createHmac(algorithm, secret).update(rawBody, "utf8").digest(String(credentials?.signature_encoding || "hex"))
  const prefix = credentials?.signature_prefix ?? "sha256="
  const supplied = stripPrefix(suppliedRaw, prefix)

  const a = Buffer.from(String(supplied), "utf8")
  const b = Buffer.from(String(digest), "utf8")
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Invalid webhook signature" }
  }
  return { ok: true }
}
