import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  featureCodes,
  FEATURE_CATALOG,
  CORE_FEATURE_CODES,
  OPERATIONS_FEATURE_CODES,
  isRestaurantProFeature
} from "@/lib/featureCatalog"
import { PLUGIN_CATALOG, PLUGIN_CODES } from "@/lib/pluginCatalog"
import { sanitizeConfigForClient, mergeConfigPreservingSecrets } from "@/lib/pluginRuntime"

export const runtime = "nodejs"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function aliasCodes(pluginCode) {
  if (pluginCode === "whatsapp-invoice" || pluginCode === "whatsapp") {
    return ["whatsapp-invoice"]
  }
  return featureCodes(pluginCode)
}

function db() {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
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

async function setRestaurantProMaster(admin, restaurantId, enabled, actorId = null) {
  const patch = {
    enabled,
    ...(actorId ? { activated_by: enabled ? actorId : null } : {}),
    ...(enabled
      ? { activated_at: new Date().toISOString(), disabled_at: null }
      : { disabled_at: new Date().toISOString() })
  }

  const { data: master, error: findError } = await admin
    .from("restaurant_plugins")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("plugin_code", "restaurant-pro")
    .maybeSingle()

  if (findError) throw new Error(findError.message)

  if (master) {
    const { error } = await admin
      .from("restaurant_plugins")
      .update(patch)
      .eq("id", master.id)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await admin
    .from("restaurant_plugins")
    .insert({
      restaurant_id: restaurantId,
      plugin_code: "restaurant-pro",
      plugin_slug: "restaurant-pro",
      enabled,
      config: {},
      display_name: "Restaurant Pro",
      category: "Core Hubs",
      description: "Integration and advanced restaurant features controlled by Super Admin.",
      feature_kind: "hub",
      activated_by: enabled ? actorId : null,
      activated_at: enabled ? new Date().toISOString() : null,
      disabled_at: enabled ? null : new Date().toISOString()
    })
  if (error) throw new Error(error.message)
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

  return { admin, userId: user.id }
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

    // The plugin catalog and default restaurant plugin rows are seeded by
    // Supabase migrations. Do not write to the database while opening the
    // Plugin Center; this endpoint is a read path and must stay fast.

    const { data: catalog, error: catalogError } = await admin
      .from("plugin_catalog")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })

    if (catalogError) throw new Error(catalogError.message)

    const canonicalCodes = PLUGIN_CODES
    const canonicalCatalog = PLUGIN_CATALOG.map(item => {
      const dbRow = (catalog || []).find(row => row.code === item.code)
      return dbRow || {
        code:item.code,name:item.name,icon:item.icon,category:item.category,
        description:item.description,kind:"plugin",active:true
      }
    })

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

    const configFor = String(new URL(request.url).searchParams.get("config_for") || "").trim()
    if (configFor) {
      if (!PLUGIN_CODES.has(configFor)) {
        return NextResponse.json({ success:false, error:"Unknown plugin" }, {status:400})
      }
      const { data:settings, error:settingsError } = await admin
        .from("plugin_settings")
        .select("config")
        .eq("restaurant_id", restaurantId)
        .in("plugin_code", aliasCodes(configFor))
        .limit(1)
        .maybeSingle()
      if (settingsError) throw new Error(settingsError.message)
      return NextResponse.json({success:true, config:sanitizeConfigForClient(settings?.config||{})})
    }

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

    if (pluginCode === "restaurant-core") {
      const { data: coreRow, error: coreError } = await admin
        .from("restaurant_plugins")
        .upsert({
          restaurant_id: restaurantId,
          plugin_code: "restaurant-core",
          plugin_slug: "restaurant-core",
          enabled: true,
          display_name: "Restaurant Core",
          category: "Core",
          description: "Core POS, orders, tables, KDS, billing and delivery master switch.",
          feature_kind: "core"
        }, { onConflict: "restaurant_id,plugin_code" })
        .select("*")
        .single()

      if (coreError) throw new Error(coreError.message)

      return NextResponse.json({
        success: true,
        plugin: coreRow,
        plugins: [coreRow],
        message: "Restaurant Core activated."
      })
    }

    if (pluginCode === "restaurant-pro") {
      await setRestaurantProMaster(admin, restaurantId, true, auth.userId || null)
      const { data: proRows, error: proRowsError } = await admin
        .from("restaurant_plugins")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("plugin_code")
      if (proRowsError) throw new Error(proRowsError.message)

      return NextResponse.json({
        success: true,
        plugin: proRows?.find(row => row.plugin_code === "restaurant-pro") || null,
        plugins: proRows || []
      })
    }

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

    // Any Pro integration/feature activated individually makes Restaurant Pro
    // available, but DOES NOT activate the other Pro features.
    if (isRestaurantProFeature(pluginCode)) {
      await setRestaurantProMaster(admin, restaurantId, true, auth.userId || null)
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

    if (!restaurantId || (!id && !body.plugin_code)) {
      return NextResponse.json(
        { success: false, error: "Invalid plugin update request" },
        { status: 400 }
      )
    }

    // Super Admin is the only role allowed to save restaurant plugin settings.
    if (body.config && typeof body.config === "object") {
      const pluginCode = String(body.plugin_code || "").trim()
      if (!PLUGIN_CODES.has(pluginCode)) {
        return NextResponse.json({success:false,error:"Unknown plugin"},{status:400})
      }
      await ensureRestaurant(admin, restaurantId)
      const {data:existingSettings,error:existingSettingsError}=await admin.from("plugin_settings")
        .select("config").eq("restaurant_id",restaurantId).eq("plugin_code",pluginCode).maybeSingle()
      if(existingSettingsError) throw new Error(existingSettingsError.message)
      const mergedConfig=mergeConfigPreservingSecrets(existingSettings?.config||{},body.config)
      const {error:settingsError}=await admin.from("plugin_settings").upsert({
        restaurant_id:restaurantId,
        plugin_code:pluginCode,
        config:mergedConfig
      },{onConflict:"restaurant_id,plugin_code"})
      if(settingsError) throw new Error(settingsError.message)

      // Keep external aggregator runtime in sync with the single Super Admin
      // configuration surface. The provider is only activated when all
      // required credentials are present; saving an incomplete form never
      // creates a falsely-connected integration.
      if (["zomato-integration","swiggy-integration"].includes(pluginCode)) {
        const provider=pluginCode.replace("-integration","")
        const credentials={
          base_url:String(mergedConfig.base_url||"").trim(),
          api_key:String(mergedConfig.api_key||"").trim(),
          webhook_secret:String(mergedConfig.webhook_secret||"").trim(),
          webhook_signature_header:String(mergedConfig.webhook_signature_header||"x-webhook-signature").trim(),
          webhook_signature_algorithm:String(mergedConfig.webhook_signature_algorithm||"sha256").trim(),
          webhook_signature_prefix:mergedConfig.webhook_signature_prefix ?? "sha256="
        }
        const outletCode=String(mergedConfig.outlet_id||"").trim()
        const ready=Boolean(outletCode && credentials.base_url && credentials.api_key && credentials.webhook_secret)
        if (outletCode) {
          const {error:integrationError}=await admin.from("aggregator_integrations").upsert({
            restaurant_id:restaurantId,provider,outlet_code:outletCode,active:ready,credentials
          },{onConflict:"restaurant_id,provider"})
          if(integrationError) throw new Error(integrationError.message)
        }
      }
      return NextResponse.json({success:true,config:sanitizeConfigForClient(mergedConfig)})
    }

    await ensureRestaurant(admin, restaurantId)

    // Restaurant Core is a real Super Admin-controlled master switch.
    if (String(body?.plugin_code || "").trim() === "restaurant-core") {
      const enabled = body?.enabled === true
      if (!enabled) {
        return NextResponse.json({
          success: false,
          error: "Restaurant Core is a protected master plugin and cannot be deactivated. Disable optional plugins individually instead."
        }, { status: 400 })
      }
      const { data: coreRow, error: coreError } = await admin
        .from("restaurant_plugins")
        .upsert({
          restaurant_id: restaurantId,
          plugin_code: "restaurant-core",
          enabled,
          installed: true,
          updated_at: new Date().toISOString()
        }, { onConflict: "restaurant_id,plugin_code" })
        .select("*")
        .single()

      if (coreError) throw new Error(coreError.message)

      return NextResponse.json({
        success: true,
        plugin: coreRow,
        plugins: [coreRow],
        message: enabled
          ? "Restaurant Core activated."
          : "Restaurant Core deactivated. Core POS feature gates are now disabled."
      })
    }

    const { data: current, error: currentError } = await admin
      .from("restaurant_plugins")
      .select("id,plugin_code")
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle()

    if (currentError) throw new Error(currentError.message)
    if (!current) throw new Error("Plugin not found")

    if (current.plugin_code === "operations-hub") {
      return NextResponse.json({
        success:false,
        error:"Operations Hub is a protected system service and cannot be deactivated."
      }, {status:400})
    }

    // Other Core feature codes are not independent plugins.
    // Restaurant Core controls them as a group.
    if (CORE_FEATURE_CODES.has(current.plugin_code)) {
      return NextResponse.json({
        success: false,
        error: "Core feature modules are controlled by the Restaurant Core plugin."
      }, {status:400})
    }

    if (current.plugin_code === "restaurant-pro") {
      const enabled = body.enabled === true
      await setRestaurantProMaster(admin, restaurantId, enabled, auth.userId || null)

      if (!enabled) {
        const { data: allRows, error: allRowsError } = await admin
          .from("restaurant_plugins")
          .select("id,plugin_code")
          .eq("restaurant_id", restaurantId)
        if (allRowsError) throw new Error(allRowsError.message)
        const proCodes = (allRows || [])
          .map(row => row.plugin_code)
          .filter(code => isRestaurantProFeature(code))
        if (proCodes.length) {
          const { error: disableError } = await admin
            .from("restaurant_plugins")
            .update({ enabled:false, disabled_at:new Date().toISOString(), activated_by:null })
            .eq("restaurant_id", restaurantId)
            .in("plugin_code", proCodes)
          if (disableError) throw new Error(disableError.message)
        }
      }

      const { data: proRows, error: proRowsError } = await admin
        .from("restaurant_plugins")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("plugin_code")

      if (proRowsError) throw new Error(proRowsError.message)

      return NextResponse.json({
        success: true,
        plugin: proRows?.find(row => row.plugin_code === "restaurant-pro") || null,
        plugins: proRows || []
      })
    }

    const codes = aliasCodes(current.plugin_code)

    const { data, error } = await admin
      .from("restaurant_plugins")
      .update({
        enabled: body.enabled,
        activated_by: body.enabled ? auth.userId || null : null,
        activated_at: body.enabled ? new Date().toISOString() : null,
        disabled_at: body.enabled ? null : new Date().toISOString()
      })
      .eq("restaurant_id", restaurantId)
      .in("plugin_code", codes)
      .select("*")

    if (error) throw new Error(error.message)

    if (isRestaurantProFeature(current.plugin_code)) {
      if (body.enabled) {
        await setRestaurantProMaster(admin, restaurantId, true, auth.userId || null)
      } else {
        const { data: activePro } = await admin
          .from("restaurant_plugins")
          .select("plugin_code")
          .eq("restaurant_id", restaurantId)
          .eq("enabled", true)

        const hasOtherPro = (activePro || []).some(
          row => isRestaurantProFeature(row.plugin_code)
        )
        if (!hasOtherPro) {
          await setRestaurantProMaster(admin, restaurantId, false, auth.userId || null)
        }
      }
    }

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

    const { data: row, error: rowError } = await admin
      .from("restaurant_plugins")
      .select("plugin_code")
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle()
    if (rowError) throw new Error(rowError.message)
    if (!row) throw new Error("Plugin not found")
    if (["operations-hub","restaurant-core","restaurant-pro"].includes(row.plugin_code)) {
      return NextResponse.json({success:false,error:"Core system plugins cannot be deleted."},{status:400})
    }

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
