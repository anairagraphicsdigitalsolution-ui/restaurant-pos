import "server-only"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { featureCodes, CORE_FEATURE_CODES, isRestaurantProFeature } from "@/lib/featureCatalog"

const FEATURE_CACHE_TTL_MS = 3000
const featureCache = new Map()

function cacheKey(restaurantId, pluginCode) { return `${restaurantId}:${pluginCode}` }
export function invalidateFeatureCache(restaurantId, pluginCode = null) {
  if (!restaurantId) return
  if (pluginCode) featureCache.delete(cacheKey(restaurantId, pluginCode))
  else for (const key of featureCache.keys()) if (key.startsWith(`${restaurantId}:`)) featureCache.delete(key)
}

export async function isFeatureEnabled(restaurantId, pluginCode) {
  if (!restaurantId || !pluginCode) return false
  const key = cacheKey(restaurantId, pluginCode)
  const cached = featureCache.get(key)
  if (cached && Date.now() - cached.at < FEATURE_CACHE_TTL_MS) return cached.value

  // Operations Hub is its own master switch and is independent of Restaurant Core.
  if (pluginCode === "operations-hub") {
    const { data, error } = await supabaseCloudAdmin
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "operations-hub")
      .maybeSingle()
    if (error) throw new Error(error.message)
    const value = data?.enabled === true
    featureCache.set(key, { value, at: Date.now() })
    return value
  }

  // Restaurant Core is a real master switch: when it is OFF, all Core POS
  // feature gates are OFF as well.
  if (pluginCode === "restaurant-core") {
    const { data, error } = await supabaseCloudAdmin
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "restaurant-core")
      .maybeSingle()
    if (error) throw new Error(error.message)
    const value = data?.enabled === true
    featureCache.set(key, { value, at: Date.now() })
    return value
  }

  if (CORE_FEATURE_CODES.has(pluginCode)) {
    const { data, error } = await supabaseCloudAdmin
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "restaurant-core")
      .maybeSingle()
    if (error) throw new Error(error.message)
    const value = data?.enabled === true
    featureCache.set(key, { value, at: Date.now() })
    return value
  }

  // P1/P2 canonical modules are independently controlled by Super Admin.
  // Do not fall back to the legacy Restaurant Pro master switch for these.
  const CANONICAL_ADVANCED = new Set([
    "p1-enterprise-hq", "p1-payment-terminals", "p1-supplier-automation",
    "p1-marketing-hub", "p1-advanced-reporting",
    "p2-call-center", "p2-banquet-events", "p2-advanced-kiosk",
    "p2-customer-display", "p2-device-hq", "p2-ai-intelligence"
  ])
  const codes = CANONICAL_ADVANCED.has(pluginCode) ? [pluginCode] : featureCodes(pluginCode)

  const { data, error } = await supabaseCloudAdmin
    .from("restaurant_plugins")
    .select("plugin_code,enabled")
    .eq("restaurant_id", restaurantId)
    .in("plugin_code", codes)
    .eq("enabled", true)
    .limit(1)

  if (error) throw new Error(error.message)

  const featureOn = Array.isArray(data) && data.length > 0
  if (!featureOn) { featureCache.set(key, { value: false, at: Date.now() }); return false }

  if (!CANONICAL_ADVANCED.has(pluginCode) && isRestaurantProFeature(pluginCode)) {
    const { data: master, error: masterError } = await supabaseCloudAdmin
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "restaurant-pro")
      .maybeSingle()

    if (masterError) throw new Error(masterError.message)
    const value = master?.enabled === true
    featureCache.set(key, { value, at: Date.now() })
    return value
  }

  // Loyalty and other Operations features remain independent of Pro.
  featureCache.set(key, { value: true, at: Date.now() })
  return true
}

export async function requireFeature(restaurantId, pluginCode) {
  const enabled = await isFeatureEnabled(restaurantId, pluginCode)
  if (!enabled) {
    throw new Error(`Feature "${pluginCode}" is not activated by Super Admin`)
  }
  return true
}

export const FEATURE_BY_ACTION = {
  hold: "pos-core",
  park: "pos-core",
  reopen: "pos-core",
  takeaway: "takeaway",
  delivery: "delivery",
  rider_settlement: "delivery-settlement",
  token: "token-management",
  void: "refunds-voids",
  refund: "refunds-voids",
  payment: "payments",
  split: "split-merge-bills",
  merge: "split-merge-bills",
  transfer_table: "table-transfer",
  move_items: "table-transfer",
  kds: "kds",
  kds_station: "kds-stations",
  inventory: "inventory-advanced",
  recipe: "recipe-bom",
  stock_deduction: "auto-stock-deduction",
  purchase: "purchasing",
  qr: "qr-ordering-pro",
  crm: "crm",
  loyalty: "loyalty",
  reservation: "reservations-pro",
  analytics: "analytics",
  offer: "offers",
  online_order: "online-ordering",
  online_reconciliation: "online-reconciliation",
  captain: "captain-app",
  kiosk: "self-service-kiosk",
  digital_display: "digital-display",
  cash_closing: "cash-closing"
}
