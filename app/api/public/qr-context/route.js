import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { rateLimit, rateLimitResponse } from "@/lib/publicRateLimit"

export const runtime = "nodejs"

function clean(value, max = 120) {
  const text = typeof value === "string" ? value.trim() : ""
  return text ? text.slice(0, max) : ""
}

function sourceFilter(query, id, numberColumn) {
  // Resolve UUIDs and numeric/label ids separately. Never send a UUID to a
  // numeric Postgres column (or vice versa), which can make PostgREST fail.
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  if (uuid) return query.eq("id", id).limit(1)
  return query.eq(numberColumn, id).limit(1)
}

export async function GET(req) {
  const limit = rateLimit(req, "qr-context", 120)
  if (!limit.ok) return rateLimitResponse(limit)

  try {
    const { searchParams } = new URL(req.url)
    const slug = clean(searchParams.get("slug"))
    const type = clean(searchParams.get("type"), 20).toLowerCase()
    const id = clean(searchParams.get("id"), 80)

    if (!slug || !id || !["table", "room"].includes(type)) {
      return Response.json({ success: false, error: "Invalid QR link" }, { status: 400, headers: { "Cache-Control": "no-store" } })
    }

    // IMPORTANT: QR menu must not depend on a version-specific SQL RPC.
    // Older installations can have an older get_public_qr_context function
    // cached in Postgres, including references to columns that do not exist
    // in this project (for example menu_items.active). Resolve the public
    // context with direct, schema-compatible queries instead.
    const { data: restaurant, error: restaurantError } = await supabaseCloudAdmin
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle()

    if (restaurantError) throw restaurantError
    if (!restaurant) throw new Error("Restaurant not found")

    const sourceTable = type === "table" ? "tables" : "rooms"
    const sourceNumberColumn = type === "table" ? "table_number" : "room_number"
    let sourceQuery = supabaseCloudAdmin
      .from(sourceTable)
      .select("id," + sourceNumberColumn)
      .eq("restaurant_id", restaurant.id)
    sourceQuery = sourceFilter(sourceQuery, id, sourceNumberColumn)
    const { data: sourceRows, error: sourceError } = await sourceQuery
    if (sourceError) throw sourceError
    const source = sourceRows?.[0]
    if (!source?.id) throw new Error("QR source not found")

    // QR plugin is still authoritative, but we deliberately avoid the plan
    // feature RPC here. A stale/broken RPC must not prevent the menu from
    // opening when the QR plugin itself is enabled.
    const { data: qrPlugins, error: pluginError } = await supabaseCloudAdmin
      .from("restaurant_plugins")
      .select("plugin_code,enabled")
      .eq("restaurant_id", restaurant.id)
      .in("plugin_code", ["qr-menu", "qr-ordering-pro"])
      .eq("enabled", true)

    if (pluginError) throw pluginError
    if (!qrPlugins?.length) {
      return Response.json({ success: false, error: "QR Menu plugin is disabled. Ask Super Admin to activate it." }, { status: 403, headers: { "Cache-Control": "no-store" } })
    }

    const advancedQrOrderingEnabled = qrPlugins.some(row => row.plugin_code === "qr-ordering-pro")

    // Only use columns that are already part of the existing menu schema.
    // In particular, do NOT filter on menu_items.active: this installation
    // does not have that column.
    const [menuResult, variantResult, offersResult, bannersResult, themeResult, themePluginResult, themeSettingsResult, operationsPluginResult, offersPluginResult, offersSettingsResult] = await Promise.all([
      supabaseCloudAdmin.from("menu_items").select("*").eq("restaurant_id", restaurant.id).order("name"),
      supabaseCloudAdmin.from("menu_variants").select("id,menu_item_id,name,price_delta,active,created_at").eq("restaurant_id", restaurant.id).eq("active", true).order("created_at"),
      supabaseCloudAdmin.from("offers").select("*").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false }),
      supabaseCloudAdmin.from("restaurant_banners").select("*").eq("restaurant_id", restaurant.id).order("sort_order").order("created_at"),
      supabaseCloudAdmin.from("restaurants").select("theme_config").eq("id", restaurant.id).maybeSingle(),
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurant.id).eq("plugin_code", "theme-branding").maybeSingle(),
      supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id", restaurant.id).eq("plugin_code", "theme-branding").maybeSingle(),
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurant.id).eq("plugin_code", "operations-hub").maybeSingle(),
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurant.id).eq("plugin_code", "offers").maybeSingle(),
      supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id", restaurant.id).eq("plugin_code", "offers").maybeSingle(),
    ])

    if (menuResult.error) throw menuResult.error
    if (variantResult.error) throw variantResult.error
    if (offersResult.error) console.warn("QR OFFERS:", offersResult.error)
    if (bannersResult.error) console.warn("QR BANNERS:", bannersResult.error)

    const variantsByItem = {}
    for (const variant of variantResult.data || []) {
      if (!variantsByItem[variant.menu_item_id]) variantsByItem[variant.menu_item_id] = []
      variantsByItem[variant.menu_item_id].push(variant)
    }

    const menu = (menuResult.data || []).map(item => ({
      ...item,
      // Existing menu rows are valid menu rows. If an older row has an
      // explicit available flag, preserve it; otherwise it is available.
      available: item.available !== false,
      variants: variantsByItem[item.id] || [],
    }))

    let offers = (offersResult.data || []).filter(o => {
      if (o.active === false) return false
      const from = o.valid_from || o.start_time
      const till = o.valid_till || o.end_time
      const now = Date.now()
      if (from && new Date(from).getTime() > now) return false
      if (till && new Date(till).getTime() < now) return false
      return true
    })

    const masterEnabled = offersPluginResult?.data?.enabled === true
    const offersEnabled = masterEnabled && offersSettingsResult?.data?.config?.offers_enabled !== false
    const combosEnabled = masterEnabled && offersSettingsResult?.data?.config?.combos_enabled !== false
    if (!offersEnabled) offers = []

    if (!combosEnabled) {
      for (let i = menu.length - 1; i >= 0; i--) {
        if (String(menu[i]?.item_type || "").toLowerCase() === "combo") menu.splice(i, 1)
      }
    }

    if (offers.length) {
      const offerIds = offers.map(o => o.id).filter(Boolean)
      const { data: mappings, error: mappingError } = await supabaseCloudAdmin
        .from("offer_products")
        .select("offer_id,menu_item_id,variant_id")
        .in("offer_id", offerIds)
      if (mappingError) console.warn("QR OFFER PRODUCTS:", mappingError)
      const byOffer = {}
      for (const row of mappings || []) {
        if (!byOffer[row.offer_id]) byOffer[row.offer_id] = []
        byOffer[row.offer_id].push({ menu_item_id: row.menu_item_id, variant_id: row.variant_id || null })
      }
      offers = offers.map(o => ({ ...o, offer_products: byOffer[o.id] || [] }))
    }

    const themeBrandingEnabled = themePluginResult?.data?.enabled === true
    const themeScope = String(themeSettingsResult?.data?.config?.theme_scope || "both").toLowerCase()
    const qrThemeEnabled = themeBrandingEnabled && ["qr", "both"].includes(themeScope)
    const brandingEnabled = themeBrandingEnabled
    const feedbackEnabled = operationsPluginResult?.data?.enabled === true

    let rating = { average: 0, count: 0 }
    if (feedbackEnabled) {
      const { data: feedbackRows, error: feedbackError } = await supabaseCloudAdmin
        .from("customer_feedback")
        .select("rating")
        .eq("restaurant_id", restaurant.id)
        .limit(500)
      if (!feedbackError) {
        const rows = feedbackRows || []
        const total = rows.reduce((sum, row) => sum + Number(row.rating || 0), 0)
        rating = { average: rows.length ? Number((total / rows.length).toFixed(1)) : 0, count: rows.length }
      }
    }

    const publicRestaurant = { ...restaurant }
    if (!brandingEnabled) publicRestaurant.logo = null

    return Response.json({
      success: true,
      restaurant: publicRestaurant,
      source: { id: source.id, type, label: `${type === "table" ? "Table" : "Room"} ${source[sourceNumberColumn]}` },
      menu,
      offers,
      banners: bannersResult.data || [],
      theme_config: qrThemeEnabled ? (themeResult?.data?.theme_config || null) : null,
      theme_runtime: { plugin_enabled: themeBrandingEnabled, scope: themeScope, qr_enabled: qrThemeEnabled },
      branding_runtime: { plugin_enabled: brandingEnabled },
      feedback_enabled: feedbackEnabled,
      rating: feedbackEnabled ? rating : { average: 0, count: 0 },
      offers_combos: { enabled: masterEnabled, offers_enabled: offersEnabled, combos_enabled: combosEnabled },
      qr_runtime: { advanced_ordering_enabled: advancedQrOrderingEnabled },
      payment_config: {
        auto_enabled: false,
        manual_enabled: false,
        merchant_name: String(restaurant.name || "Restaurant").slice(0, 100),
        upi_id: "",
        manual_qr_image_url: "",
        auto_provider: null,
      },
    }, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        "CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        "Vercel-CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    })
  } catch (error) {
    console.error("QR CONTEXT ERROR:", error)
    return Response.json({ success: false, error: error?.message || "QR context could not be loaded" }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}
