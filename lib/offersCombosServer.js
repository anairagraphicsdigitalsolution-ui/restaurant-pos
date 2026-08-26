import { supabaseAdmin } from "@/lib/supabaseServer"

export async function getOffersCombosAccess(restaurantId) {
  if (!restaurantId) return { plugin_enabled:false, offers_enabled:false, combos_enabled:false }
  const [{data:plugin,error:pluginError},{data:settings,error:settingsError}] = await Promise.all([
    supabaseAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id",restaurantId).eq("plugin_code","offers").maybeSingle(),
    supabaseAdmin.from("plugin_settings").select("config").eq("restaurant_id",restaurantId).eq("plugin_code","offers").maybeSingle()
  ])
  if (pluginError) throw new Error(pluginError.message)
  if (settingsError) throw new Error(settingsError.message)
  const pluginEnabled=plugin?.enabled===true
  const config=settings?.config||{}
  return {
    plugin_enabled:pluginEnabled,
    offers_enabled:pluginEnabled && config.offers_enabled!==false,
    combos_enabled:pluginEnabled && config.combos_enabled!==false,
  }
}
