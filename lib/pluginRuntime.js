import { supabaseCloudAdmin } from "./supabaseCloudServer"
import { PLUGIN_CODES } from "./pluginCatalog"

export const SECRET_CONFIG_KEYS = new Set([
  "access_token","api_key","webhook_secret","webhook_app_secret","access_token_secret",
  "client_secret","app_secret","private_key","password","token","bridge_api_key","webhook_verify_token"
])

const INTERNAL_TABLES = {
  "reservations-pro": ["reservations"],
  "qr-ordering-pro": ["orders","order_items"],
  "qr-print-center": ["restaurants"],
  "website-ordering": ["restaurants","orders"],
  "captain-app": ["orders","order_items"],
  "smart-notifications": ["orders"],
  "calling-device": ["orders"],
  "offers": ["offers"],
  "thermal-printing": ["orders"],
  "a4-invoice": ["orders"],
  "hardware-print-queue": ["orders"],
  "restaurant-pro": ["restaurant_plugins"],
  "operations-hub": ["restaurant_plugins"],
  "theme-branding": ["restaurants","plugin_settings"],
  "restaurant-settings": ["restaurants","plugin_settings"],
  "restaurant-core": ["orders","order_items"],
}

export const PLUGIN_CONFIG_META = {
  "whatsapp-invoice": { required:["phone_number_id","access_token"], secrets:["access_token","webhook_app_secret"] },
  "cashfree-payment-gateway": { required:["client_id","client_secret"], secrets:["client_secret"] },
  "facebook-integration": { required:["account_id","access_token"], secrets:["access_token"] },
  "instagram-integration": { required:["account_id","access_token"], secrets:["access_token"] },
  "zomato-integration": { required:["outlet_id","base_url","api_key","webhook_secret"], secrets:["api_key","webhook_secret"] },
  "swiggy-integration": { required:["outlet_id","base_url","api_key","webhook_secret"], secrets:["api_key","webhook_secret"] },
  "hardware-print-queue": { required:["bridge_url"], secrets:["api_key"] },
  "thermal-printing": { required:[], secrets:["api_key"] },
  "a4-invoice": { required:[], secrets:["api_key"] },
  "qr-print-center": { required:[], secrets:[] },
  "website-ordering": { required:[], secrets:[] },
  "captain-app": { required:[], secrets:[] },
  "smart-notifications": { required:[], secrets:[] },
  "calling-device": { required:[], secrets:[] },
  "offers": { required:[], secrets:[] },
  "reservations-pro": { required:[], secrets:[] },
  "restaurant-pro": { required:[], secrets:[] },
  "operations-hub": { required:[], secrets:[] },
  "theme-branding": { required:[], secrets:[] },
  "restaurant-settings": { required:[], secrets:[] },
  "restaurant-core": { required:[], secrets:[] },
}

function clean(value){ return String(value ?? "").trim() }

export function validateExternalUrl(rawUrl, { allowPrivate = false, requireHttps = true } = {}) {
  const value = clean(rawUrl)
  if (!value) throw new Error("URL is required")
  let url
  try { url = new URL(value) } catch { throw new Error("Invalid URL") }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are allowed")
  if (requireHttps && url.protocol !== "https:") {
    const host = url.hostname.toLowerCase()
    const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1"
    if (!(allowPrivate && localHost)) throw new Error("HTTPS is required for external integrations")
  }
  const host = url.hostname.toLowerCase()
  const isPrivate =
    host === "localhost" || host === "127.0.0.1" || host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "0.0.0.0"
  if (isPrivate && !allowPrivate) throw new Error("Private/local network URLs are not allowed for this integration")
  return url
}
function missing(config, keys){ return keys.filter(k => !clean(config?.[k])) }

export function sanitizeConfigForClient(config = {}) {
  const out = { ...config }
  for (const key of SECRET_CONFIG_KEYS) {
    if (clean(out[key])) out[key] = "••••••••"
  }
  return out
}

export function mergeConfigPreservingSecrets(existing = {}, incoming = {}) {
  const merged = { ...existing, ...incoming }
  for (const key of SECRET_CONFIG_KEYS) {
    if (incoming[key] === "••••••••" || incoming[key] === "") {
      if (clean(existing[key])) merged[key] = existing[key]
      else delete merged[key]
    }
  }
  return merged
}

async function tableHealth(restaurantId, table){
  const q = supabaseCloudAdmin.from(table).select("id").limit(1)
  if (["restaurant_plugins","orders","order_items","reservations","offers"].includes(table) && restaurantId) {
    // Do not assume every table has restaurant_id. Query the common restaurant tables directly.
    if (["orders","reservations","offers"].includes(table)) q.eq("restaurant_id", restaurantId)
  }
  const { error } = await q
  if (error) throw new Error(`${table}: ${error.message}`)
}

async function internalTest(restaurantId, code){
  for (const table of (INTERNAL_TABLES[code] || ["restaurant_plugins"])) await tableHealth(restaurantId, table)
  return { connected:true, mode:"database", message:"Database runtime is ready." }
}

async function metaTest(config, code){
  const meta = PLUGIN_CONFIG_META[code] || {required:[],secrets:[]}
  const missingKeys = missing(config, meta.required)
  if (missingKeys.length) throw new Error(`Missing credentials: ${missingKeys.join(", ")}`)
  const base = clean(config.base_url) || "https://graph.facebook.com"
  if (code === "whatsapp-invoice") {
    const version = clean(config.api_version) || "v23.0"
    const baseUrl = validateExternalUrl(config.base_url || "https://graph.facebook.com", { allowPrivate:false, requireHttps:true })
    const url = `${baseUrl.toString().replace(/\/$/,"")}/${version}/${encodeURIComponent(config.phone_number_id)}`
    const res = await fetch(`${url}?fields=id,display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${config.access_token}` } })
    const body = await res.text()
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${body.slice(0,500)}`)
    return {connected:true,mode:"meta-cloud",provider:"whatsapp",result:JSON.parse(body)}
  }
  if (code === "facebook-integration") {
    const baseUrl = validateExternalUrl(config.base_url || "https://graph.facebook.com", { allowPrivate:false, requireHttps:true })
    const url = `${baseUrl.toString().replace(/\/$/,"")}/${encodeURIComponent(config.account_id)}?fields=id,name`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.access_token}` } }); const body = await res.text()
    if (!res.ok) throw new Error(`Facebook Graph ${res.status}: ${body.slice(0,500)}`)
    return {connected:true,mode:"meta-graph",provider:"facebook",result:JSON.parse(body)}
  }
  if (code === "instagram-integration") {
    const baseUrl = validateExternalUrl(config.base_url || "https://graph.facebook.com", { allowPrivate:false, requireHttps:true })
    const url = `${baseUrl.toString().replace(/\/$/,"")}/${encodeURIComponent(config.account_id)}?fields=id,username`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.access_token}` } }); const body = await res.text()
    if (!res.ok) throw new Error(`Instagram Graph ${res.status}: ${body.slice(0,500)}`)
    return {connected:true,mode:"meta-graph",provider:"instagram",result:JSON.parse(body)}
  }
  throw new Error("Unsupported external integration test")
}

async function restTest(config, code){
  const meta = PLUGIN_CONFIG_META[code]
  const missingKeys = missing(config, meta.required)
  if (missingKeys.length) throw new Error(`Missing credentials: ${missingKeys.join(", ")}`)
  const baseUrl = validateExternalUrl(config.base_url, { allowPrivate:false, requireHttps:true })
  const base = baseUrl.toString().replace(/\/$/,"")
  const path = clean(config.health_path) || "/"
  const target = `${base}${path.startsWith("/") ? path : `/${path}`}`
  const headers = { Accept:"application/json", "Content-Type":"application/json" }
  const apiKeyHeader = clean(config.api_key_header) || "Authorization"
  const apiKeyPrefix = config.api_key_prefix === undefined ? "Bearer " : String(config.api_key_prefix)
  if (config.api_key) headers[apiKeyHeader] = `${apiKeyPrefix}${config.api_key}`
  const method = String(config.health_method || "GET").toUpperCase()
  const res = await fetch(target,{method,headers})
  const body = await res.text()
  if (!res.ok) throw new Error(`${code} API ${res.status}: ${body.slice(0,500)}`)
  return {connected:true,mode:"rest",provider:code,endpoint:target,result:body ? (()=>{try{return JSON.parse(body)}catch{return body}})() : null}
}

export async function testPlugin({restaurantId, pluginCode, config = {}}){
  if (!PLUGIN_CODES.has(pluginCode)) throw new Error("Unknown plugin")
  if (["whatsapp-invoice","facebook-integration","instagram-integration"].includes(pluginCode)) return metaTest(config,pluginCode)
  if (pluginCode === "cashfree-payment-gateway") {
    const missingKeys = missing(config, PLUGIN_CONFIG_META[pluginCode].required)
    if (missingKeys.length) throw new Error(`Missing credentials: ${missingKeys.join(", ")}`)
    const base = clean(config.environment) === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg"
    const apiVersion = clean(config.api_version) || "2025-01-01"
    const res = await fetch(`${base}/orders/cf_health_check`, { method:"GET", headers: { "x-api-version":apiVersion, "x-client-id":clean(config.client_id), "x-client-secret":clean(config.client_secret), "accept":"application/json" } })
    const body = await res.text()
    if (res.status === 404) return {connected:true,mode:"cashfree",environment:clean(config.environment)||"sandbox",message:"Cashfree credentials authenticated; health endpoint is not exposed, so use Create Order test to verify end-to-end."}
    if (!res.ok) throw new Error(`Cashfree API ${res.status}: ${body.slice(0,500)}`)
    return {connected:true,mode:"cashfree",environment:clean(config.environment)||"sandbox",result:body ? (()=>{try{return JSON.parse(body)}catch{return body}})() : null}
  }
  if (["zomato-integration","swiggy-integration"].includes(pluginCode)) return restTest(config,pluginCode)
  if (pluginCode === "hardware-print-queue") {
    const bridgeUrl = validateExternalUrl(config.bridge_url, { allowPrivate: config.allow_private_bridge === true, requireHttps: config.allow_private_bridge !== true })
    const url = bridgeUrl.toString()
    const headers = config.api_key ? {Authorization:`Bearer ${config.api_key}`} : {}
    const res=await fetch(url,{method:"GET",headers}); const body=await res.text()
    if(!res.ok) throw new Error(`Print bridge ${res.status}: ${body.slice(0,300)}`)
    return {connected:true,mode:"hardware-bridge",result:body}
  }
  return internalTest(restaurantId,pluginCode)
}

export function pluginHealthAction(code){
  if(!PLUGIN_CODES.has(code)) throw new Error("Unknown plugin")
  return {plugin_code:code, runtime:"canonical", supports_test_connection:true}
}


/**
 * Super Admin must never be blocked by restaurant/plugin subscription gates.
 * Use this helper before restaurant-level plugin permission checks.
 */
export function isSuperAdminRole(role) {
  const normalized = String(role || "").toLowerCase().replace(/[\s-]+/g, "_")
  return normalized === "super_admin" ||
         normalized === "superadmin" ||
         normalized === "owner_super_admin"
}

/**
 * Returns true for Super Admin and otherwise leaves plugin access
 * to the normal restaurant subscription/plugin checks.
 */
export function canManageSaleablePlugin(role, normalPluginAccess) {
  if (isSuperAdminRole(role)) return true
  return Boolean(normalPluginAccess)
}
