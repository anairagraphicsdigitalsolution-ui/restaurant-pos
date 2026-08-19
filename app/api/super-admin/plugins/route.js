import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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

    const { data: catalog, error: catalogError } = await admin
      .from("plugin_catalog")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })

    if (catalogError) throw new Error(catalogError.message)

    if (!restaurantId) {
      const { data: restaurants, error: restaurantsError } = await admin
        .from("restaurants")
        .select("id,name,status")
        .order("name", { ascending: true })

      if (restaurantsError) throw new Error(restaurantsError.message)

      return NextResponse.json({
        success: true,
        catalog: catalog || [],
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
      catalog: catalog || [],
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

    const { data: catalog, error: catalogError } = await admin
      .from("plugin_catalog")
      .select("*")
      .eq("code", pluginCode)
      .eq("active", true)
      .maybeSingle()

    if (catalogError) throw new Error(catalogError.message)
    if (!catalog) {
      return NextResponse.json(
        { success: false, error: "Plugin is not available in the catalog" },
        { status: 400 }
      )
    }

    await ensureRestaurant(admin, restaurantId)

    const { data: existing, error: existingError } = await admin
      .from("restaurant_plugins")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", pluginCode)
      .maybeSingle()

    if (existingError) throw new Error(existingError.message)

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Plugin already installed" },
        { status: 409 }
      )
    }

    const { data, error } = await admin
      .from("restaurant_plugins")
      .insert({
        restaurant_id: restaurantId,
        plugin_code: pluginCode,
        plugin_slug: pluginCode,
        enabled: true,
        display_name: catalog.name,
        category: catalog.category,
        description: catalog.description,
        feature_kind: catalog.kind
      })
      .select("*")
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({
      success: true,
      plugin: data
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

    const { data, error } = await admin
      .from("restaurant_plugins")
      .update({ enabled: body.enabled })
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .select("*")
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({
      success: true,
      plugin: data
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
