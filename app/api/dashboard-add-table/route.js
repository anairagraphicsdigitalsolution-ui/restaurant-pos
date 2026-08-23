import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

async function resolveRestaurant(userId, user) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, restaurant_id")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!profile) throw new Error("Profile not found")
  if (!["admin", "super_admin"].includes(profile.role)) throw new Error("Admin access required")

  if (profile.role === "super_admin") {
    const requested = String(user?.user_metadata?.restaurant_id || "").trim()
    return requested || null
  }

  if (profile.restaurant_id) return profile.restaurant_id

  const metadataId = String(user?.user_metadata?.restaurant_id || "").trim()
  if (metadataId) return metadataId

  const { data: owned } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle()

  return owned?.id || null
}

export async function POST(request) {
  try {
    const user = await requireApiUser(request)
    const body = await request.json()
    const value = Number(body?.table_number)

    if (!Number.isInteger(value) || value < 1) {
      return NextResponse.json({ success: false, error: "Enter a valid table number." }, { status: 400 })
    }

    const restaurantId = await resolveRestaurant(user.id, user)
    if (!restaurantId) {
      return NextResponse.json({ success: false, error: "Restaurant not linked to this account." }, { status: 400 })
    }

    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("id", restaurantId)
      .maybeSingle()

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 })
    }

    const { data: existing } = await supabaseAdmin
      .from("tables")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("table_number", value)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: false, error: "Table Number already exists." }, { status: 409 })
    }

    const { data, error } = await supabaseAdmin
      .from("tables")
      .insert({ table_number: value, restaurant_id: restaurantId })
      .select("*")
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("ADD TABLE ERROR:", error)
    return NextResponse.json({ success: false, error: error?.message || "Unable to add table" }, { status: 500 })
  }
}
