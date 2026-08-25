import { supabaseAdmin } from "./supabaseServer"
import * as whatsappLegacy from "../plugins/whatsapp"

const plugins = {
  whatsapp: whatsappLegacy,
  "whatsapp-invoice": whatsappLegacy,
}

// Install/enable a plugin for a restaurant.
// Runtime state lives in restaurant_plugins; config lives in plugin_settings.
export async function installPlugin(restaurant_id, plugin_code, config = {}) {
  const canonical = plugin_code === "whatsapp" ? "whatsapp-invoice" : plugin_code

  const { data, error } = await supabaseAdmin
    .from("restaurant_plugins")
    .upsert(
      {
        restaurant_id,
        plugin_code: canonical,
        plugin_slug: canonical,
        enabled: true,
        config: {},
        display_name: canonical === "whatsapp-invoice" ? "WhatsApp Invoice" : canonical,
      },
      { onConflict: "restaurant_id,plugin_code" }
    )
    .select()
    .single()

  if (error) throw error

  if (config && Object.keys(config).length) {
    const { error: settingsError } = await supabaseAdmin
      .from("plugin_settings")
      .upsert(
        { restaurant_id, plugin_code: canonical, config },
        { onConflict: "restaurant_id,plugin_code" }
      )
    if (settingsError) throw settingsError
  }

  return data
}

export async function getPlugin(restaurant_id, plugin_code) {
  const codes = plugin_code === "whatsapp"
    ? ["whatsapp-invoice", "whatsapp"]
    : [plugin_code]

  const { data: plugin, error } = await supabaseAdmin
    .from("restaurant_plugins")
    .select("*")
    .eq("restaurant_id", restaurant_id)
    .in("plugin_code", codes)
    .maybeSingle()

  if (error || !plugin || plugin.enabled !== true) return null

  const { data: settings } = await supabaseAdmin
    .from("plugin_settings")
    .select("config")
    .eq("restaurant_id", restaurant_id)
    .in("plugin_code", codes)
    .maybeSingle()

  return {
    ...plugin,
    config: settings?.config || plugin.config || {},
  }
}

export async function runPlugin(restaurant_id, plugin_code, action, data = {}) {
  const plugin = plugins[plugin_code]
  if (!plugin) throw new Error("Plugin not found")

  const installed = await getPlugin(restaurant_id, plugin_code)
  if (!installed) throw new Error("Plugin is disabled or not configured")

  if (typeof plugin[action] !== "function") {
    throw new Error(`Unsupported plugin action: ${action}`)
  }

  return await plugin[action]({ ...data, _restaurantId: restaurant_id }, installed.config)
}
