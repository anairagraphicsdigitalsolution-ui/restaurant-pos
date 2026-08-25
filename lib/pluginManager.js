import { supabaseAdmin } from "./supabaseServer"
import { PLUGIN_CODES } from "./pluginCatalog"
import { pluginHealthAction, testPlugin } from "./pluginRuntime"

export async function installPlugin(restaurant_id, plugin_code, config = {}) {
  const canonical = plugin_code === "whatsapp" ? "whatsapp-invoice" : plugin_code
  if (!PLUGIN_CODES.has(canonical)) throw new Error("Unknown plugin")
  const { data, error } = await supabaseAdmin.from("restaurant_plugins").upsert({
    restaurant_id, plugin_code: canonical, plugin_slug: canonical, enabled: true,
    config: {}, display_name: canonical === "whatsapp-invoice" ? "WhatsApp" : canonical,
    installed: true, updated_at: new Date().toISOString()
  }, { onConflict: "restaurant_id,plugin_code" }).select().single()
  if (error) throw error
  if (config && Object.keys(config).length) {
    const { error: settingsError } = await supabaseAdmin.from("plugin_settings").upsert(
      { restaurant_id, plugin_code: canonical, config },
      { onConflict: "restaurant_id,plugin_code" }
    )
    if (settingsError) throw settingsError
  }
  return data
}

export async function getPlugin(restaurant_id, plugin_code) {
  const canonical = plugin_code === "whatsapp" ? "whatsapp-invoice" : plugin_code
  const { data: plugin, error } = await supabaseAdmin.from("restaurant_plugins").select("*")
    .eq("restaurant_id", restaurant_id).eq("plugin_code", canonical).maybeSingle()
  if (error) throw error
  if (!plugin || plugin.enabled !== true) return null
  const { data: settings, error: settingsError } = await supabaseAdmin.from("plugin_settings").select("config")
    .eq("restaurant_id", restaurant_id).eq("plugin_code", canonical).maybeSingle()
  if (settingsError) throw settingsError
  return { ...plugin, config: settings?.config || plugin.config || {} }
}

export async function runPlugin(restaurant_id, plugin_code, action) {
  const canonical = plugin_code === "whatsapp" ? "whatsapp-invoice" : plugin_code
  const installed = await getPlugin(restaurant_id, canonical)
  if (!installed) throw new Error("Plugin is disabled or not configured")
  if (action === "health") return pluginHealthAction(canonical)
  if (action === "test_connection") {
    return testPlugin({ restaurantId: restaurant_id, pluginCode: canonical, config: installed.config || {} })
  }
  throw new Error(`Plugin action runtime is not registered for ${canonical}. Use the dedicated plugin API.`)
}
