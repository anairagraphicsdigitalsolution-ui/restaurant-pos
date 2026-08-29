import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const body = await req.json()
    const email = String(body?.email || "").trim().toLowerCase()
    const password = String(body?.password || "")
    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password are required." }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    if (!url || !anonKey) {
      return NextResponse.json({ success: false, error: "Anaira Cloud authentication is not configured." }, { status: 503 })
    }

    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password })
    if (authError || !authData?.user || !authData?.session) {
      return NextResponse.json({ success: false, error: authError?.message || "Invalid email or password." }, { status: 401 })
    }

    const user = authData.user
    let restaurantId = null
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("restaurant_id,role")
      .eq("id", user.id)
      .maybeSingle()
    if (profile?.restaurant_id) restaurantId = profile.restaurant_id

    if (!restaurantId) {
      const metadataRestaurantId = user.user_metadata?.restaurant_id || user.app_metadata?.restaurant_id || null
      if (metadataRestaurantId) {
        const { data: restaurant } = await supabaseAdmin.from("restaurants").select("id").eq("id", metadataRestaurantId).maybeSingle()
        if (restaurant?.id) restaurantId = restaurant.id
      }
    }

    if (!restaurantId) {
      const { data: ownedRestaurant } = await supabaseAdmin
        .from("restaurants")
        .select("id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (ownedRestaurant?.id) restaurantId = ownedRestaurant.id
    }

    if (!restaurantId) {
      return NextResponse.json({ success: false, error: "No restaurant is linked to this account." }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email || email },
      restaurantId,
      cloudUrl: url,
      cloudAnonKey: anonKey,
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresAt: authData.session.expires_at || null
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Installer login failed." }, { status: 500 })
  }
}
