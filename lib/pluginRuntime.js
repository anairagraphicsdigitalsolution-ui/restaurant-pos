import { supabaseAdmin } from "./supabaseServer"
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
  "restaurant-core": ["orders","order_items"],
}

export const PLUGIN_CONFIG_META = {
  "whatsapp-invoice": { required:["phone_number_id","access_token"], secrets:["access_token","webhook_app_secret"] },
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
  "restaurant-core": { required:[], secrets:[] },
}

function clean(value){ return String(value ?? "").trim() }
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
  const q = supabaseAdmin.from(table).select("id").limit(1)
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
    const url = `${base.replace(/\/$/,"")}/${version}/${encodeURIComponent(config.phone_number_id)}`
    const res = await fetch(`${url}?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(config.access_token)}`)
    const body = await res.text()
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${body.slice(0,500)}`)
    return {connected:true,mode:"meta-cloud",provider:"whatsapp",result:JSON.parse(body)}
  }
  if (code === "facebook-integration") {
    const url = `${base.replace(/\/$/,"")}/${encodeURIComponent(config.account_id)}?fields=id,name&access_token=${encodeURIComponent(config.access_token)}`
    const res = await fetch(url); const body = await res.text()
    if (!res.ok) throw new Error(`Facebook Graph ${res.status}: ${body.slice(0,500)}`)
    return {connected:true,mode:"meta-graph",provider:"facebook",result:JSON.parse(body)}
  }
  if (code === "instagram-integration") {
    const url = `${base.replace(/\/$/,"")}/${encodeURIComponent(config.account_id)}?fields=id,username&access_token=${encodeURIComponent(config.access_token)}`
    const res = await fetch(url); const body = await res.text()
    if (!res.ok) throw new Error(`Instagram Graph ${res.status}: ${body.slice(0,500)}`)
    return {connected:true,mode:"meta-graph",provider:"instagram",result:JSON.parse(body)}
  }
  throw new Error("Unsupported external integration test")
}

async function restTest(config, code){
  const meta = PLUGIN_CONFIG_META[code]
  const missingKeys = missing(config, meta.required)
  if (missingKeys.length) throw new Error(`Missing credentials: ${missingKeys.join(", ")}`)
  const base = clean(config.base_url).replace(/\/$/,"")
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
  if (["zomato-integration","swiggy-integration"].includes(pluginCode)) return restTest(config,pluginCode)
  if (pluginCode === "hardware-print-queue") {
    const url = clean(config.bridge_url)
    if (!url) throw new Error("Bridge URL is required")
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
