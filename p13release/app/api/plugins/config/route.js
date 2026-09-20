import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/serverAuth"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { PLUGIN_CODES } from "@/lib/pluginCatalog"
import { sanitizeConfigForClient, mergeConfigPreservingSecrets } from "@/lib/pluginRuntime"

export const runtime = "nodejs"

async function context(req, requestedRestaurantId) {
  const user = await requireApiUser(req)
  const { data: profile, error } = await supabaseCloudAdmin
    .from("profiles")
    .select("id,role,restaurant_id")
    .eq("id", user.id)
    .maybeSingle()
  if (error || !profile) throw new Error("Profile not found")
  if (!["admin","super_admin"].includes(profile.role)) throw new Error("Not authorized")

  let restaurantId = String(requestedRestaurantId || "").trim()
  if (profile.role === "super_admin") {
    if (!restaurantId) throw new Error("restaurant_id is required for Super Admin")
  } else {
    const resolved = await resolveRestaurantForUser(user)
    restaurantId = resolved.restaurantId || profile.restaurant_id || ""
    if (!restaurantId) throw new Error("Restaurant not found")
    if (requestedRestaurantId && requestedRestaurantId !== restaurantId) throw new Error("Not authorized for this restaurant")
  }
  return { restaurantId, profile }
}

function validatePlugin(code) {
  if (!PLUGIN_CODES.has(code)) throw new Error("Unknown plugin")
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const pluginCode = String(url.searchParams.get("plugin_code") || "").trim()
    validatePlugin(pluginCode)
    const { restaurantId } = await context(req, url.searchParams.get("restaurant_id"))
    const { data, error } = await supabaseCloudAdmin
      .from("plugin_settings")
      .select("config,updated_at")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", pluginCode)
      .maybeSingle()
    if (error) throw error
    const { data: pluginRow, error: pluginError } = await supabaseCloudAdmin
      .from("restaurant_plugins")
      .select("enabled,installed")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", pluginCode)
      .maybeSingle()
    if (pluginError) throw pluginError
    return NextResponse.json({
      success: true,
      restaurant_id: restaurantId,
      plugin_code: pluginCode,
      enabled: pluginRow?.enabled === true,
      installed: pluginRow?.installed === true,
      config: sanitizeConfigForClient(data?.config || {}),
      updated_at: data?.updated_at || null,
    })
  } catch (error) {
    const message = error?.message || "Unable to load plugin configuration"
    return NextResponse.json({ success:false, error:message }, { status:/authorized|profile|authentication/i.test(message) ? 403 : 400 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const pluginCode = String(body?.plugin_code || "").trim()
    validatePlugin(pluginCode)
    const { restaurantId } = await context(req, body?.restaurant_id)
    const incoming = body?.config && typeof body.config === "object" ? body.config : {}

    const { data: existingRow, error: readError } = await supabaseCloudAdmin
      .from("plugin_settings")
      .select("config")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", pluginCode)
      .maybeSingle()
    if (readError) throw readError

    const merged = mergeConfigPreservingSecrets(existingRow?.config || {}, incoming)
    const { data, error } = await supabaseCloudAdmin
      .from("plugin_settings")
      .upsert(
        { restaurant_id: restaurantId, plugin_code: pluginCode, config: merged, updated_at: new Date().toISOString() },
        { onConflict: "restaurant_id,plugin_code" }
      )
      .select("updated_at")
      .single()
    if (error) throw error

    return NextResponse.json({
      success:true,
      restaurant_id:restaurantId,
      plugin_code:pluginCode,
      config:sanitizeConfigForClient(merged),
      updated_at:data?.updated_at || null,
    })
  } catch (error) {
    const message = error?.message || "Unable to save plugin configuration"
    return NextResponse.json({ success:false,error:message }, { status:/authorized|profile|authentication/i.test(message) ? 403 : 400 })
  }
}
