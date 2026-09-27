export function normalizeAggregatorAction(action) {
  const map = { pickedup: "picked_up", accept: "accept", reject: "reject", prepare: "prepare", ready: "ready", cancel: "cancel" }
  const v = map[String(action || "").toLowerCase()]
  if (!v) throw new Error("Unsupported aggregator action")
  return v
}

export function providerConfig(integration) {
  const c = integration?.credentials || {}
  const baseUrl = String(c.base_url || "").replace(/\/+$/, "")
  if (!baseUrl) throw new Error("Aggregator base URL is not configured")
  return c
}

export function endpointFor(c, action) {
  const configured = c?.actions?.[action]
  if (!configured) throw new Error(`No configured provider endpoint for ${action}`)
  return String(configured).startsWith("http") ? String(configured) : `${String(c.base_url).replace(/\/+$/, "")}/${String(configured).replace(/^\/+/, "")}`
}

export function buildProviderHeaders(c) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" }
  if (c.api_key) headers.Authorization = `Bearer ${c.api_key}`
  if (c.headers && typeof c.headers === "object") {
    for (const [k, v] of Object.entries(c.headers)) if (v != null && k) headers[k] = String(v)
  }
  return headers
}

export async function callProvider({ integration, action, payload }) {
  const c = providerConfig(integration)
  const url = endpointFor(c, action)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(Number(c.timeout_ms || 10000), 1000), 30000))
  try {
    const response = await fetch(url, {
      method: String(c.action_method || "POST").toUpperCase(),
      headers: buildProviderHeaders(c),
      body: JSON.stringify({ outlet_id: integration.outlet_code, ...payload }),
      signal: controller.signal,
      cache: "no-store"
    })
    const raw = await response.text()
    let data = raw
    try { data = raw ? JSON.parse(raw) : {} } catch {}
    return { ok: response.ok, status: response.status, data }
  } finally {
    clearTimeout(timer)
  }
}
