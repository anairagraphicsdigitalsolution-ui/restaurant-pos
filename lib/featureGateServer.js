import { supabaseAdmin } from "@/lib/supabaseServer"

export async function isFeatureEnabled(restaurantId, pluginCode){
  if(!restaurantId || !pluginCode) return false
  const {data,error}=await supabaseAdmin
    .from("restaurant_plugins")
    .select("enabled")
    .eq("restaurant_id",restaurantId)
    .eq("plugin_code",pluginCode)
    .maybeSingle()
  if(error) throw new Error(error.message)
  return data?.enabled===true
}

export async function requireFeature(restaurantId, pluginCode){
  const enabled=await isFeatureEnabled(restaurantId,pluginCode)
  if(!enabled) throw new Error(`Feature "${pluginCode}" is not activated by Super Admin`)
  return true
}

export const FEATURE_BY_ACTION={
  hold:"pos-core",
  park:"pos-core",
  reopen:"pos-core",
  void:"refunds-voids",
  refund:"refunds-voids",
  payment:"payments",
  split:"split-merge-bills",
  merge:"split-merge-bills",
  transfer_table:"table-transfer",
  move_items:"table-transfer",
  kds:"kds"
}
