import { supabase } from "./supabase"

const plugins = {
  razorpay: require("../plugins/razorpay"),
  whatsapp: require("../plugins/whatsapp")
}

// 🔥 INSTALL
export async function installPlugin(restaurant_id, plugin_code, config) {
  const { data, error } = await supabase
    .from("plugins")
    .insert([
      {
        restaurant_id,
        plugin_code,
        config,
        active: true
      }
    ])

  if (error) throw error

  return data
}

// 🔥 GET
export async function getPlugin(restaurant_id, plugin_code) {
  const { data, error } = await supabase
    .from("plugins")
    .select("*")
    .eq("restaurant_id", restaurant_id)
    .eq("plugin_code", plugin_code)
    .single()

  if (error) return null

  return data
}

// 🔥 RUN
export async function runPlugin(restaurant_id, plugin_code, action, data) {
  const plugin = plugins[plugin_code]

  if (!plugin) throw new Error("Plugin not found")

  const installed = await getPlugin(restaurant_id, plugin_code)

  if (!installed || !installed.active) {
    throw new Error("Plugin not installed")
  }

  return await plugin[action](data, installed.config)
}