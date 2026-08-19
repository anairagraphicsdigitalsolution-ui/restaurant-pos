import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function adminClient() {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

async function authenticateSuperAdmin(request) {
  const auth = request.headers.get("authorization") || ""

  if (!auth.startsWith("Bearer ")) {
    return { error: "Authentication required", status: 401 }
  }

  const token = auth.slice(7).trim()

  if (!token) {
    return { error: "Authentication required", status: 401 }
  }

  const authClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  const {
    data: { user },
    error: userError
  } = await authClient.auth.getUser(token)

  if (userError || !user) {
    return { error: "Invalid or expired session", status: 401 }
  }

  const db = adminClient()

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id, role, restaurant_id")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("PROFILE LOOKUP ERROR:", profileError)
    return { error: "Unable to verify user role", status: 500 }
  }

  if (!profile || profile.role !== "super_admin") {
    return { error: "Super Admin access required", status: 403 }
  }

  return { user, db }
}

export async function GET(request) {
  try {
    const auth = await authenticateSuperAdmin(request)

    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      )
    }

    const { db } = auth

    const { data: restaurants, error } = await db
      .from("restaurants")
      .select("id, name, status")
      .order("name", { ascending: true })

    if (error) {
      console.error("RESTAURANTS ERROR:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      restaurants: restaurants || []
    })
  } catch (error) {
    console.error("GET USERS ERROR:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load data" },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  let createdUserId = null

  try {
    const auth = await authenticateSuperAdmin(request)

    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      )
    }

    const { db } = auth
    const body = await request.json()

    const restaurantId = String(body?.restaurant_id || "").trim()
    const role = String(body?.role || "").trim().toLowerCase()
    const name = String(body?.name || "").trim()
    const email = String(body?.email || "").trim().toLowerCase()
    const password = String(body?.password || "")

    if (!restaurantId || !name || !email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: "Restaurant, name, email and password are required"
        },
        { status: 400 }
      )
    }

    if (!["admin", "staff"].includes(role)) {
      return NextResponse.json(
        { success: false, error: "Only Admin or Staff can be created here" },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400 }
      )
    }

    const { data: restaurant, error: restaurantError } = await db
      .from("restaurants")
      .select("id, name, status")
      .eq("id", restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return NextResponse.json(
        { success: false, error: "Restaurant not found" },
        { status: 400 }
      )
    }

    if (restaurant.status === "inactive") {
      return NextResponse.json(
        { success: false, error: "This restaurant is inactive" },
        { status: 400 }
      )
    }

    const { data: authData, error: createAuthError } =
      await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          role,
          restaurant_id: restaurantId
        }
      })

    if (createAuthError || !authData?.user) {
      console.error("AUTH USER CREATE ERROR:", createAuthError)
      return NextResponse.json(
        {
          success: false,
          error:
            createAuthError?.message ||
            "Unable to create authentication user"
        },
        { status: 400 }
      )
    }

    createdUserId = authData.user.id

    // Keep the profile row minimal and compatible with the existing schema:
    // id, role and restaurant_id are the fields used by the application.
    const { error: profileError } = await db
      .from("profiles")
      .upsert(
        {
          id: createdUserId,
          role,
          restaurant_id: restaurantId
        },
        {
          onConflict: "id"
        }
      )

    if (profileError) {
      console.error("PROFILE CREATE ERROR:", profileError)

      await db.auth.admin.deleteUser(createdUserId)

      return NextResponse.json(
        {
          success: false,
          error: `User could not be linked to restaurant: ${profileError.message}`
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: createdUserId,
        email,
        role,
        restaurant_id: restaurantId
      }
    })
  } catch (error) {
    console.error("CREATE ADMIN STAFF ERROR:", error)

    if (createdUserId) {
      try {
        await adminClient().auth.admin.deleteUser(createdUserId)
      } catch {}
    }

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to create account"
      },
      { status: 500 }
    )
  }
}
