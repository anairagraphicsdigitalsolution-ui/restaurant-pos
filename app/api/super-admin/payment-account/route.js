import { NextResponse } from "next/server"
import { supabaseCloudAdmin, supabaseCloudAuth } from "@/lib/supabaseCloudServer"

export const runtime = "nodejs"

async function authenticateSuperAdmin(request) {
  const header = request.headers.get("authorization") || ""
  if (!header.startsWith("Bearer ")) {
    return { error: "Authentication required", status: 401 }
  }

  const token = header.slice(7).trim()
  if (!token) return { error: "Authentication required", status: 401 }

  const { data: { user }, error: userError } = await supabaseCloudAuth.auth.getUser(token)
  if (userError || !user) {
    return { error: "Invalid or expired session", status: 401 }
  }

  const db = supabaseCloudAdmin
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) return { error: "Unable to verify user role", status: 500 }
  if (!profile || profile.role !== "super_admin") {
    return { error: "Super Admin access required", status: 403 }
  }

  return { db }
}

async function getRestaurant(db, restaurantId) {
  const { data, error } = await db
    .from("restaurants")
    .select("id,name,status")
    .eq("id", restaurantId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("Restaurant not found")
  return data
}

export async function GET(request) {
  try {
    const auth = await authenticateSuperAdmin(request)
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

    const restaurantId = String(new URL(request.url).searchParams.get("restaurant_id") || "").trim()
    if (!restaurantId) return NextResponse.json({ success: false, error: "restaurant_id is required" }, { status: 400 })

    await getRestaurant(auth.db, restaurantId)

    const [{ data: plugin, error: pluginError }, { data: account, error: accountError }] = await Promise.all([
      auth.db.from("restaurant_plugins")
        .select("id,plugin_code,enabled,display_name")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "payment-accounts")
        .maybeSingle(),
      auth.db.from("restaurant_payment_accounts")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("provider", "payment-accounts")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ])

    if (pluginError) throw new Error(pluginError.message)
    if (accountError) throw new Error(accountError.message)

    const settings = account?.settings || {}

    return NextResponse.json({
      success: true,
      plugin_enabled: plugin?.enabled === true,
      account: account ? {
        id: account.id,
        provider: account.provider,
        display_name: account.display_name,
        merchant_reference: account.merchant_reference || "",
        active: account.active === true,
        merchant_name: settings.merchant_name || "",
        upi_id: settings.upi_id || "",
        auto_payment_detection: settings.auto_payment_detection === true,
        voice_enabled: settings.voice_enabled !== false,
        voice_language: settings.voice_language || "hi-IN"
      } : null
    })
  } catch (error) {
    console.error("SUPER ADMIN PAYMENT ACCOUNT GET ERROR:", error)
    return NextResponse.json({ success: false, error: error?.message || "Unable to load merchant payment settings" }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const auth = await authenticateSuperAdmin(request)
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

    const body = await request.json()
    const restaurantId = String(body?.restaurant_id || "").trim()
    if (!restaurantId) return NextResponse.json({ success: false, error: "restaurant_id is required" }, { status: 400 })

    await getRestaurant(auth.db, restaurantId)

    const { data: plugin, error: pluginError } = await auth.db
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "payment-accounts")
      .maybeSingle()

    if (pluginError) throw new Error(pluginError.message)
    if (plugin?.enabled !== true) {
      return NextResponse.json({
        success: false,
        error: "Merchant Payments & Voice plugin is not active for this restaurant. Activate it from Super Admin → Plugins first."
      }, { status: 400 })
    }

    const upiId = String(body?.upi_id || "").trim()
    if (upiId && !/^[^\s@]+@[^\s@]+$/.test(upiId)) {
      return NextResponse.json({ success: false, error: "Enter a valid Merchant UPI ID, for example restaurant@upi" }, { status: 400 })
    }

    const row = {
      restaurant_id: restaurantId,
      provider: "payment-accounts",
      display_name: "Merchant Payments & Voice",
      merchant_reference: String(body?.merchant_reference || "").trim() || null,
      active: body?.active === true,
      settings: {
        merchant_name: String(body?.merchant_name || "").trim(),
        upi_id: upiId,
        auto_payment_detection: body?.auto_payment_detection === true,
        voice_enabled: body?.voice_enabled !== false,
        voice_language: body?.voice_language === "en-IN" ? "en-IN" : "hi-IN"
      },
      updated_at: new Date().toISOString()
    }

    const { data, error } = await auth.db
      .from("restaurant_payment_accounts")
      .upsert(row, { onConflict: "restaurant_id,provider,display_name" })
      .select("*")
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, message: "Merchant payment settings saved", account: data })
  } catch (error) {
    console.error("SUPER ADMIN PAYMENT ACCOUNT PATCH ERROR:", error)
    return NextResponse.json({ success: false, error: error?.message || "Unable to save merchant payment settings" }, { status: 500 })
  }
}
