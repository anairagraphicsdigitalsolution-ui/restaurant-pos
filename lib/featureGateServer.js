import { supabaseAdmin } from "@/lib/supabaseServer"
import { featureCodes, CORE_FEATURE_CODES, isRestaurantProFeature } from "@/lib/featureCatalog"

export async function isFeatureEnabled(restaurantId, pluginCode) {
  if (!restaurantId || !pluginCode) return false

  // Operations Hub remains independent. Restaurant Core is a real master
  // switch: when it is OFF, all Core POS feature gates are OFF as well.
  if (pluginCode === "restaurant-core") {
    const { data, error } = await supabaseAdmin
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "restaurant-core")
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.enabled === true
  }

  if (CORE_FEATURE_CODES.has(pluginCode)) {
    const { data, error } = await supabaseAdmin
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "restaurant-core")
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.enabled === true
  }

  const codes = featureCodes(pluginCode)

  const { data, error } = await supabaseAdmin
    .from("restaurant_plugins")
    .select("plugin_code,enabled")
    .eq("restaurant_id", restaurantId)
    .in("plugin_code", codes)
    .eq("enabled", true)
    .limit(1)

  if (error) throw new Error(error.message)

  const featureOn = Array.isArray(data) && data.length > 0
  if (!featureOn) return false

  if (isRestaurantProFeature(pluginCode)) {
    const { data: master, error: masterError } = await supabaseAdmin
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "restaurant-pro")
      .maybeSingle()

    if (masterError) throw new Error(masterError.message)
    return master?.enabled === true
  }

  // Loyalty and other Operations features remain independent of Pro.
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
