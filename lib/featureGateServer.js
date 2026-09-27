import "server-only"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { pluginOwnerForFeature } from "@/lib/pluginOwnership"

const FEATURE_CACHE_TTL_MS = 3000
const featureCache = new Map()

function cacheKey(restaurantId, pluginCode) { return `${restaurantId}:${pluginCode}` }
export function invalidateFeatureCache(restaurantId, pluginCode = null) {
  if (!restaurantId) return
  if (pluginCode) featureCache.delete(cacheKey(restaurantId, pluginCode))
  else for (const key of featureCache.keys()) if (key.startsWith(`${restaurantId}:`)) featureCache.delete(key)
}

/**
 * Single runtime gate for plugin-owned features.
 *
 * Restaurant Core is deliberately preserved as a master for the existing Core POS
 * surface. Every non-Core feature resolves to exactly one canonical owning plugin.
 * There is no Restaurant Pro fallback and no multi-plugin OR gate.
 */
export async function isFeatureEnabled(restaurantId, featureCode) {
  if (!restaurantId || !featureCode) return false

  const owner = pluginOwnerForFeature(featureCode)
  const key = cacheKey(restaurantId, owner)
  const cached = featureCache.get(key)
  if (cached && Date.now() - cached.at < FEATURE_CACHE_TTL_MS) return cached.value

  const { data, error } = await supabaseCloudAdmin
    .from("restaurant_plugins")
    .select("enabled")
    .eq("restaurant_id", restaurantId)
    .eq("plugin_code", owner)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const value = data?.enabled === true
  featureCache.set(key, { value, at: Date.now() })
  return value
}

export async function requireFeature(restaurantId, featureCode) {
  const owner = pluginOwnerForFeature(featureCode)
  const enabled = await isFeatureEnabled(restaurantId, featureCode)
  if (!enabled) {
    throw new Error(`Plugin "${owner}" is not activated by Super Admin`)
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
  kiosk: "p2-advanced-kiosk",
  digital_display: "p2-customer-display",
  cash_closing: "cash-closing",
}
