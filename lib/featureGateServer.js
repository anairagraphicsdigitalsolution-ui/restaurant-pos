import { supabaseAdmin } from "@/lib/supabaseServer"

const FEATURE_ALIASES = {
  "qr-menu": ["qr-menu", "qr-ordering-pro"],
  "qr-ordering-pro": ["qr-menu", "qr-ordering-pro"],
  pos: ["pos", "pos-core"],
  "pos-core": ["pos", "pos-core"],
  whatsapp: ["whatsapp", "whatsapp-invoice"],
  "whatsapp-invoice": ["whatsapp", "whatsapp-invoice"],
  reservations: ["reservations", "reservations-pro"],
  "reservations-pro": ["reservations", "reservations-pro"]
}

export async function isFeatureEnabled(restaurantId, pluginCode) {
  if (!restaurantId || !pluginCode) return false

  const codes = FEATURE_ALIASES[pluginCode] || [pluginCode]

  const { data, error } = await supabaseAdmin
    .from("restaurant_plugins")
    .select("enabled")
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
  void: "refunds-voids",
  refund: "refunds-voids",
  payment: "payments",
  split: "split-merge-bills",
  merge: "split-merge-bills",
  transfer_table: "table-transfer",
  move_items: "table-transfer",
  kds: "kds"
}
