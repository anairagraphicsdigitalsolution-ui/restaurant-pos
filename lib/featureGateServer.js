import { supabaseAdmin } from "@/lib/supabaseServer"
import { featureCodes } from "@/lib/featureCatalog"

export async function isFeatureEnabled(restaurantId, pluginCode) {
  if (!restaurantId || !pluginCode) return false

  const codes = featureCodes(pluginCode)

  const { data, error } = await supabaseAdmin
    .from("restaurant_plugins")
    .select("plugin_code,enabled")
    .eq("restaurant_id", restaurantId)
    .in("plugin_code", codes)
    .eq("enabled", true)
    .limit(1)

  if (error) throw new Error(error.message)
  return Array.isArray(data) && data.length > 0
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
