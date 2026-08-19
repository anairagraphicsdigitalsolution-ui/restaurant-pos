import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"

export async function GET(req) {
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
      await supabaseAdmin.rpc(
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

    const { data: qrEnabled, error: qrPlanError } = await supabaseAdmin.rpc("has_restaurant_plan_feature", {
      p_restaurant_id: restaurantId,
      p_plugin_code: "qr-menu"
    })

    if (qrPlanError || qrEnabled !== true) {
      return Response.json({ success:false, error:"QR Menu is not available on this restaurant plan" }, { status:403, headers:{"Cache-Control":"no-store"} })
    }

    const { data: qrPlugin, error: qrPluginError } = await supabaseAdmin
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "qr-menu")
      .maybeSingle()

    if (qrPluginError) {
      console.error("QR MENU PLUGIN ERROR:", qrPluginError)
      return Response.json(
        { success:false, error:"Unable to verify QR Menu plugin" },
        { status:500, headers:{"Cache-Control":"no-store"} }
      )
    }

    if (qrPlugin?.enabled !== true) {
      return Response.json(
        { success:false, error:"QR Menu plugin is disabled. Ask Super Admin to activate it." },
        { status:403, headers:{"Cache-Control":"no-store"} }
      )
    }

    const { data: themeRow } = await supabaseAdmin
      .from("restaurants")
      .select("theme_config")
      .eq("id", restaurantId)
      .maybeSingle()

    // Product-targeted offers need their menu-item mappings in the public QR context.
    // The mapping contains only offer/menu item ids; prices and eligibility remain
    // authoritative on the server-side order/billing functions.
    if (Array.isArray(data?.offers) && data.offers.length) {
      const offerIds = data.offers.map(o => o.id).filter(Boolean)
      if (offerIds.length) {
        const { data: offerProducts, error: offerProductsError } = await supabaseAdmin
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

    let rating = { average: 0, count: 0 }

    if (restaurantId) {
      const { data: feedbackRows } = await supabaseAdmin
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
        theme_config: themeRow?.theme_config || null,
        rating
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