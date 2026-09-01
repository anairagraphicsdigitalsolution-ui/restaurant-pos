import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { rateLimit, rateLimitResponse } from "@/lib/publicRateLimit"

export const runtime = "nodejs"

export async function GET(req) {
  const limit = rateLimit(req, "qr-context", 120)
  if (!limit.ok) return rateLimitResponse(limit)
  try {
    const { searchParams } = new URL(req.url)

    const slug = searchParams.get("slug")?.trim()
    const type = searchParams.get("type")?.trim().toLowerCase()
    const id = searchParams.get("id")?.trim()

    // -----------------------------------------
    // VALIDATION
    // -----------------------------------------

    if (
      !slug ||
      !type ||
      !id ||
      !["table", "room"].includes(type)
    ) {
      return Response.json(
        {
          success: false,
          error: "Invalid QR link"
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      )
    }

    // -----------------------------------------
    // GET QR CONTEXT
    // -----------------------------------------

    const { data, error } =
      await supabaseCloudAdmin.rpc(
        "get_public_qr_context",
        {
          p_slug: slug,
          p_type: type,
          p_id: id
        }
      )

    if (error) {
      console.error(
        "QR CONTEXT ERROR:",
        error
      )

      return Response.json(
        {
          success: false,
          error: "QR context could not be loaded"
        },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      )
    }

    // -----------------------------------------
    // FAST PUBLIC CACHE
    // -----------------------------------------
    //
    // Menu / offers / restaurant information
    // can safely stay cached for a short time.
    //
    // This dramatically improves repeat QR scans.
    //
    // s-maxage = Vercel/CDN cache
    // stale-while-revalidate = serve old data
    // while fresh data loads in background
    //

    const restaurantId = data?.restaurant?.id

    if (!restaurantId) {
      return Response.json({ success:false, error:"Restaurant is unavailable" }, { status:404, headers:{"Cache-Control":"no-store"} })
    }

    const { data: qrEnabled, error: qrPlanError } = await supabaseCloudAdmin.rpc("has_restaurant_plan_feature", {
      p_restaurant_id: restaurantId,
      p_plugin_code: "qr-menu"
    })

    if (qrPlanError || qrEnabled !== true) {
      return Response.json({ success:false, error:"QR Menu is not available on this restaurant plan" }, { status:403, headers:{"Cache-Control":"no-store"} })
    }

    const { data: qrPlugin, error: qrPluginError } = await supabaseCloudAdmin
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .in("plugin_code", ["qr-menu", "qr-ordering-pro"])
      .eq("enabled", true)
      .limit(1)

    if (qrPluginError) {
      console.error("QR MENU PLUGIN ERROR:", qrPluginError)
      return Response.json(
        { success:false, error:"Unable to verify QR Menu plugin" },
        { status:500, headers:{"Cache-Control":"no-store"} }
      )
    }

    if (!qrPlugin?.length) {
      return Response.json(
        { success:false, error:"QR Menu plugin is disabled. Ask Super Admin to activate it." },
        { status:403, headers:{"Cache-Control":"no-store"} }
      )
    }

    const [
      { data: themeRow },
      { data: themePlugin },
      { data: themeSettings },
      { data: brandingPlugin },
      { data: operationsHubPlugin },
    ] = await Promise.all([
      supabaseCloudAdmin.from("restaurants").select("theme_config").eq("id", restaurantId).maybeSingle(),
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "theme-branding").maybeSingle(),
      supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id", restaurantId).eq("plugin_code", "theme-branding").maybeSingle(),
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "theme-branding").maybeSingle(),
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "operations-hub").maybeSingle(),
    ])

    const themeBrandingEnabled = themePlugin?.enabled === true
    const themeScope = String(themeSettings?.config?.theme_scope || "both").toLowerCase()
    const qrThemeEnabled = themeBrandingEnabled && ["qr","both"].includes(themeScope)
    const brandingEnabled = brandingPlugin?.enabled === true
    const feedbackEnabled = operationsHubPlugin?.enabled === true

    const publicThemeConfig = qrThemeEnabled ? (themeRow?.theme_config || null) : null

    // Offers & Combos master plugin. The master switch must be ON; the two
    // capabilities are then controlled independently by Super Admin config.
    const [{ data: offersComboPlugin }, { data: offersComboSettings }] = await Promise.all([
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "offers").maybeSingle(),
      supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id", restaurantId).eq("plugin_code", "offers").maybeSingle()
    ])
    const masterEnabled = offersComboPlugin?.enabled === true
    const offersEnabled = masterEnabled && offersComboSettings?.config?.offers_enabled !== false
    const combosEnabled = masterEnabled && offersComboSettings?.config?.combos_enabled !== false

    if (!offersEnabled) data.offers = []
    if (!combosEnabled && Array.isArray(data?.menu)) {
      data.menu = data.menu.filter(item => item?.item_type !== "combo")
    }

    // Product-targeted offers need their menu-item mappings in the public QR context.
    // The mapping contains only offer/menu item ids; prices and eligibility remain
    // authoritative on the server-side order/billing functions.
    if (Array.isArray(data?.offers) && data.offers.length) {
      const offerIds = data.offers.map(o => o.id).filter(Boolean)
      if (offerIds.length) {
        const { data: offerProducts, error: offerProductsError } = await supabaseCloudAdmin
          .from("offer_products")
          .select("offer_id,menu_item_id")
          .in("offer_id", offerIds)

        if (offerProductsError) {
          console.error("QR OFFER PRODUCTS ERROR:", offerProductsError)
        } else {
          const byOffer = {}
          ;(offerProducts || []).forEach(row => {
            if (!byOffer[row.offer_id]) byOffer[row.offer_id] = []
            byOffer[row.offer_id].push({ menu_item_id: row.menu_item_id })
          })
          data.offers = data.offers.map(o => ({
            ...o,
            offer_products: byOffer[o.id] || []
          }))
        }
      }
    }

    if (!brandingEnabled && data?.restaurant) {
      data.restaurant = { ...data.restaurant, logo: null }
    }

    let rating = { average: 0, count: 0 }

    if (feedbackEnabled && restaurantId) {
      const { data: feedbackRows } = await supabaseCloudAdmin
        .from("customer_feedback")
        .select("rating")
        .eq("restaurant_id", restaurantId)
        .limit(500)

      const rows = feedbackRows || []
      const total = rows.reduce((sum, row) => sum + Number(row.rating || 0), 0)
      rating = {
        average: rows.length ? Number((total / rows.length).toFixed(1)) : 0,
        count: rows.length
      }
    }

    return Response.json(
      {
        success: true,
        ...data,
        theme_config: publicThemeConfig,
        theme_runtime: { plugin_enabled: themeBrandingEnabled, scope: themeScope, qr_enabled: qrThemeEnabled },
        branding_runtime: { plugin_enabled: brandingEnabled },
        feedback_enabled: feedbackEnabled,
        rating: feedbackEnabled ? rating : { average: 0, count: 0 },
        offers_combos: { enabled: masterEnabled, offers_enabled: offersEnabled, combos_enabled: combosEnabled }
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "public, s-maxage=30, stale-while-revalidate=120",

          "CDN-Cache-Control":
            "public, s-maxage=30, stale-while-revalidate=120",

          "Vercel-CDN-Cache-Control":
            "public, s-maxage=30, stale-while-revalidate=120"
        }
      }
    )

  } catch (error) {

    console.error(
      "QR CONTEXT ERROR:",
      error
    )

    return Response.json(
      {
        success: false,
        error: "QR context could not be loaded"
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    )
  }
}