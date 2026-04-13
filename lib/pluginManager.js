import { supabase } from "./supabase"

const plugins = {
  razorpay: require("../plugins/razorpay"),
  whatsapp: require("../plugins/whatsapp")
}

// 🔥 INSTALL
export async function installPlugin(restaurant_id, plugin_slug, config) {
  const { data, error } = await supabase
    .from("plugins")
    .insert([
      {
        restaurant_id,
        plugin_slug,
        config,
        active: true
      }
    ])

  if (error) throw error

  return data
}

// 🔥 GET
export async function getPlugin(restaurant_id, plugin_slug) {
  const { data, error } = await supabase
    .from("plugins")
    .select("*")
    .eq("restaurant_id", restaurant_id)
    .eq("plugin_slug", plugin_slug)
    .single()

  if (error) return null

  return data
}

// 🔥 RUN
export async function runPlugin(restaurant_id, plugin_slug, action, data) {
  const plugin = plugins[plugin_slug]

  if (!plugin) throw new Error("Plugin not found")

  const installed = await getPlugin(restaurant_id, plugin_slug)

  if (!installed || !installed.active) {
    throw new Error("Plugin not installed")
  }

  return await plugin[action](data, installed.config)
}