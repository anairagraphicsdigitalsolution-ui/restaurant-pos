import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { featureCodes, FEATURE_CATALOG } from "@/lib/featureCatalog"

export const runtime = "nodejs"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY


function aliasCodes(pluginCode) {
  return featureCodes(pluginCode)
}

function db() {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function authSuperAdmin(request) {
  const header = request.headers.get("authorization") || ""
  if (!header.startsWith("Bearer ")) {
    return { error: "Authentication required", status: 401 }
  }

  const token = header.slice(7).trim()
  if (!token) return { error: "Authentication required", status: 401 }

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: { user }, error } = await authClient.auth.getUser(token)

  if (error || !user) {
    return { error: "Invalid or expired session", status: 401 }
  }

  const admin = db()

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("PROFILE ERROR:", profileError)
    return { error: "Unable to verify role", status: 500 }
  }

  if (!profile || profile.role !== "super_admin") {
    return { error: "Super Admin access required", status: 403 }
  }

  return { admin }
}

async function ensureRestaurant(admin, restaurantId) {
  const { data, error } = await admin
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("Restaurant not found")
}

export async function GET(request) {
  try {
    const auth = await authSuperAdmin(request)

    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      )
    }

    const { admin } = auth
    const restaurantId = new URL(request.url).searchParams.get("restaurant_id")

    // Keep the database catalog aligned with the canonical feature catalog.
    // This makes newly-added plugins visible even if an older migration was not seeded yet.
    const canonicalRows = FEATURE_CATALOG.map((item, index) => ({
      code: item.code,
      name: item.name,
      icon: item.icon || "🧩",
      category: item.category || "General",
      description: item.description || "",
      kind: "feature",
      sort_order: index + 1,
      active: true
    }))
    for (const row of canonicalRows) {
      const { error: seedError } = await admin
        .from("plugin_catalog")
        .upsert(row, { onConflict: "code" })
      if (seedError) {
        console.error("PLUGIN CATALOG SEED ERROR:", seedError)
        break
      }
    }

    // Self-heal the independent QR Print Center installation row for every restaurant.
    // This never changes an existing enabled value; it only creates a missing OFF row.
    const qrPrintCatalog = canonicalRows.find((row) => row.code === "qr-print-center")
    if (qrPrintCatalog) {
      const { data: allRestaurants } = await admin.from("restaurants").select("id")
      const { data: existingQrRows } = await admin
        .from("restaurant_plugins")
        .select("restaurant_id")
        .eq("plugin_code", "qr-print-center")
      const existingQr = new Set((existingQrRows || []).map((row) => row.restaurant_id))
      const missingQr = (allRestaurants || [])
        .filter((r) => !existingQr.has(r.id))
        .map((r) => ({
          restaurant_id: r.id,
          plugin_code: "qr-print-center",
          plugin_slug: "qr-print-center",
          enabled: false,
          config: {},
          display_name: qrPrintCatalog.name,
          category: qrPrintCatalog.category,
          description: qrPrintCatalog.description,
          feature_kind: qrPrintCatalog.kind,
        }))
      if (missingQr.length) {
        const { error: qrSeedError } = await admin.from("restaurant_plugins").insert(missingQr)
        if (qrSeedError) console.error("QR PRINT CENTER INSTALL ROW SEED ERROR:", qrSeedError)
      }
    }

    const { data: catalog, error: catalogError } = await admin
      .from("plugin_catalog")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })

    if (catalogError) throw new Error(catalogError.message)

    const canonicalCodes = new Set(FEATURE_CATALOG.map(item => item.code).concat(["operations-hub","restaurant-core","restaurant-pro"]))
    const canonicalCatalog = (catalog || []).filter(item => canonicalCodes.has(item.code))

    if (!restaurantId) {
      const { data: restaurants, error: restaurantsError } = await admin
        .from("restaurants")
        .select("id,name,status")
        .order("name", { ascending: true })

      if (restaurantsError) throw new Error(restaurantsError.message)

      return NextResponse.json({
        success: true,
        catalog: canonicalCatalog,
        restaurants: restaurants || []
      })
    }

    await ensureRestaurant(admin, restaurantId)

    const { data, error } = await admin
      .from("restaurant_plugins")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("category", { ascending: true })
      .order("display_name", { ascending: true })

    if (error) throw new Error(error.message)

    return NextResponse.json({
      success: true,
      catalog: canonicalCatalog,
      plugins: data || []
    })

  } catch (error) {
    console.error("PLUGIN GET ERROR:", error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load plugins"
      },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    const auth = await authSuperAdmin(request)

    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      )
    }

    const { admin } = auth
    const body = await request.json()

    const restaurantId = String(body?.restaurant_id || "").trim()
    const pluginCode = String(body?.plugin_code || "").trim()

    if (!restaurantId || !pluginCode) {
      return NextResponse.json(
        { success: false, error: "Invalid restaurant or plugin" },
        { status: 400 }
      )
    }

    let { data: catalog, error: catalogError } = await admin
      .from("plugin_catalog")
      .select("*")
      .eq("code", pluginCode)
      .eq("active", true)
      .maybeSingle()

    if (catalogError) throw new Error(catalogError.message)
    if (!catalog) {
      const canonical = FEATURE_CATALOG.find(item => item.code === pluginCode)
      if (canonical) {
        const { data: seeded, error: seedError } = await admin
          .from("plugin_catalog")
          .upsert({
            code: canonical.code,
            name: canonical.name,
            icon: canonical.icon || "🧩",
            category: canonical.category || "General",
            description: canonical.description || "",
            kind: "feature",
            sort_order: FEATURE_CATALOG.findIndex(item => item.code === canonical.code) + 1,
            active: true
          }, { onConflict: "code" })
          .select("*")
          .maybeSingle()
        if (seedError) throw new Error(seedError.message)
        catalog = seeded
      }
    }
    if (!catalog) {
      return NextResponse.json(
        { success: false, error: "Plugin is not available in the catalog" },
        { status: 400 }
      )
    }

    await ensureRestaurant(admin, restaurantId)

    const codes = aliasCodes(pluginCode)
    const results = []

    for (const code of codes) {
      const { data: aliasCatalog, error: aliasCatalogError } = await admin
        .from("plugin_catalog")
        .select("*")
        .eq("code", code)
        .eq("active", true)
        .maybeSingle()

      if (aliasCatalogError) throw new Error(aliasCatalogError.message)

      const { data: existingRow, error: existingRowError } = await admin
        .from("restaurant_plugins")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", code)
        .limit(1)
        .maybeSingle()

      if (existingRowError) throw new Error(existingRowError.message)

      if (existingRow) {
        const { data: updatedRows, error: updateError } = await admin
          .from("restaurant_plugins")
          .update({ enabled: true })
          .eq("id", existingRow.id)
          .select("*")

        if (updateError) throw new Error(updateError.message)
        if (updatedRows?.[0]) results.push(updatedRows[0])
      } else {
        const { data: insertedRows, error: insertError } = await admin
          .from("restaurant_plugins")
          .insert({
            restaurant_id: restaurantId,
            plugin_code: code,
            plugin_slug: code,
            enabled: true,
            display_name: aliasCatalog?.name || catalog.name,
            category: aliasCatalog?.category || catalog.category,
            description: aliasCatalog?.description || catalog.description,
            feature_kind: aliasCatalog?.kind || catalog.kind
          })
          .select("*")

        if (insertError) throw new Error(insertError.message)
        if (insertedRows?.[0]) results.push(insertedRows[0])
      }
    }

    return NextResponse.json({
      success: true,
      plugin: results.find(row => row.plugin_code === pluginCode) || results[0] || null,
      plugins: results
    })
  } catch (error) {
    console.error("PLUGIN INSTALL ERROR:", error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to install plugin"
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request) {
  try {
    const auth = await authSuperAdmin(request)

    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      )
    }

    const { admin } = auth
    const body = await request.json()

    const restaurantId = String(body?.restaurant_id || "").trim()
    const id = String(body?.id || "").trim()

    if (!restaurantId || !id || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Invalid plugin update request" },
        { status: 400 }
      )
    }

    await ensureRestaurant(admin, restaurantId)

    const { data: current, error: currentError } = await admin
      .from("restaurant_plugins")
      .select("id,plugin_code")
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle()

    if (currentError) throw new Error(currentError.message)
    if (!current) throw new Error("Plugin not found")

    const codes = aliasCodes(current.plugin_code)

    const { data, error } = await admin
      .from("restaurant_plugins")
      .update({ enabled: body.enabled })
      .eq("restaurant_id", restaurantId)
      .in("plugin_code", codes)
      .select("*")

    if (error) throw new Error(error.message)

    return NextResponse.json({
      success: true,
      plugin: data?.find(row => row.id === id) || data?.[0] || null,
      plugins: data || []
    })
  } catch (error) {
    console.error("PLUGIN UPDATE ERROR:", error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to update plugin"
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request) {
  try {
    const auth = await authSuperAdmin(request)

    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      )
    }

    const { admin } = auth
    const body = await request.json()

    const restaurantId = String(body?.restaurant_id || "").trim()
    const id = String(body?.id || "").trim()

    if (!restaurantId || !id) {
      return NextResponse.json(
        { success: false, error: "Invalid plugin delete request" },
        { status: 400 }
      )
    }

    await ensureRestaurant(admin, restaurantId)

    const { error } = await admin
      .from("restaurant_plugins")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurantId)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("PLUGIN DELETE ERROR:", error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to remove plugin"
      },
      { status: 500 }
    )
  }
}
