import { NextResponse } from "next/server"
import { supabaseCloudAdmin, supabaseCloudAuth } from "@/lib/supabaseCloudServer"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || "").trim().toLowerCase()
    const password = String(body?.password || "")

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

    if (!url || !anonKey) {
      return NextResponse.json(
        { success: false, error: "Anaira Cloud authentication is not configured." },
        { status: 503 }
      )
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Anaira Cloud server configuration is incomplete (service-role key is missing).",
        },
        { status: 503 }
      )
    }

    // Authenticate the installer user against the SAME Cloud Supabase project.
    const { data: authData, error: authError } =
      await supabaseCloudAuth.auth.signInWithPassword({ email, password })

    if (authError || !authData?.user || !authData?.session) {
      return NextResponse.json(
        {
          success: false,
          error: authError?.message || "Invalid email or password.",
        },
        { status: 401 }
      )
    }

    const user = authData.user
    let restaurantId = null

    // IMPORTANT:
    // Installer login is a CLOUD control-plane operation. Do NOT use
    // supabaseServer.js here because a restaurant installation can run in
    // The installer uses the Cloud Supabase configuration.
    const { data: profile, error: profileError } = await supabaseCloudAdmin
      .from("profiles")
      .select("restaurant_id,role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Installer login profile lookup failed:", profileError)
    }

    if (profile?.restaurant_id) {
      restaurantId = profile.restaurant_id
    }

    if (!restaurantId) {
      const metadataRestaurantId =
        user.user_metadata?.restaurant_id ||
        user.app_metadata?.restaurant_id ||
        null

      if (metadataRestaurantId) {
        const { data: restaurant, error } = await supabaseCloudAdmin
          .from("restaurants")
          .select("id")
          .eq("id", metadataRestaurantId)
          .maybeSingle()

        if (!error && restaurant?.id) {
          restaurantId = restaurant.id
        }
      }
    }

    if (!restaurantId) {
      const { data: ownedRestaurant, error } = await supabaseCloudAdmin
        .from("restaurants")
        .select("id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!error && ownedRestaurant?.id) {
        restaurantId = ownedRestaurant.id
      }
    }

    if (!restaurantId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Login succeeded, but this Anaira account is not linked to a restaurant.",
        },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email || email,
      },
      restaurantId,
      cloudUrl: url,
      cloudAnonKey: anonKey,
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresAt: authData.session.expires_at || null,
    })
  } catch (error) {
    console.error("Installer login unexpected error:", error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Installer login failed.",
      },
      { status: 500 }
    )
  }
}
