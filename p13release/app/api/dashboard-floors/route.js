import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

async function resolveRestaurant(userId) {
  const { data: profile, error } = await supabaseCloudAdmin
    .from("profiles")
    .select("id, role, restaurant_id")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!profile) throw new Error("Profile not found")
  if (profile.role !== "admin") throw new Error("Restaurant Admin access required")

  if (profile.restaurant_id) return profile.restaurant_id

  const { data: owned } = await supabaseCloudAdmin
    .from("restaurants")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle()

  return owned?.id || null
}

async function getContext(request) {
  const user = await requireApiUser(request)
  const restaurantId = await resolveRestaurant(user.id)
  if (!restaurantId) throw new Error("Restaurant not linked to this account.")
  return { user, restaurantId }
}

export async function GET(request) {
  try {
    const { restaurantId } = await getContext(request)
    const { data, error } = await supabaseCloudAdmin
      .from("floors")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true })
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to load floors" }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { restaurantId } = await getContext(request)
    const body = await request.json()
    const name = String(body?.name || "").trim()
    if (!name || name.length > 80) {
      return NextResponse.json({ success: false, error: "Enter a floor name (1-80 characters)." }, { status: 400 })
    }

    const { data: existing } = await supabaseCloudAdmin
      .from("floors").select("id").eq("restaurant_id", restaurantId).ilike("name", name).limit(1).maybeSingle()
    if (existing) return NextResponse.json({ success: false, error: "Floor already exists." }, { status: 409 })

    const { data: last } = await supabaseCloudAdmin
      .from("floors").select("display_order").eq("restaurant_id", restaurantId)
      .order("display_order", { ascending: false }).limit(1).maybeSingle()

    const { data, error } = await supabaseCloudAdmin
      .from("floors")
      .insert({ restaurant_id: restaurantId, name, display_order: Number(last?.display_order || 0) + 1 })
      .select("*").single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to add floor" }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const { restaurantId } = await getContext(request)
    const body = await request.json()
    const id = String(body?.id || "")
    const name = String(body?.name || "").trim()
    if (!id || !name || name.length > 80) {
      return NextResponse.json({ success: false, error: "Floor id and name are required." }, { status: 400 })
    }

    const { data: existing } = await supabaseCloudAdmin
      .from("floors").select("id").eq("restaurant_id", restaurantId).ilike("name", name).neq("id", id).limit(1).maybeSingle()
    if (existing) return NextResponse.json({ success: false, error: "Floor already exists." }, { status: 409 })

    const { data: floor, error } = await supabaseCloudAdmin
      .from("floors").select("name").eq("id", id).eq("restaurant_id", restaurantId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!floor) return NextResponse.json({ success: false, error: "Floor not found." }, { status: 404 })

    const { data, error: updateError } = await supabaseCloudAdmin
      .from("floors").update({ name }).eq("id", id).eq("restaurant_id", restaurantId).select("*").single()
    if (updateError) throw new Error(updateError.message)

    // Keep the legacy table.floor field synchronized so the existing POS/floor map keeps working.
    const { error: tableError } = await supabaseCloudAdmin
      .from("tables").update({ floor: name }).eq("restaurant_id", restaurantId).eq("floor", floor.name)
    if (tableError) throw new Error(tableError.message)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to update floor" }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const { restaurantId } = await getContext(request)
    const body = await request.json()
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ success: false, error: "Floor id is required." }, { status: 400 })

    const { data: floor, error: floorError } = await supabaseCloudAdmin
      .from("floors").select("id,name").eq("id", id).eq("restaurant_id", restaurantId).maybeSingle()
    if (floorError) throw new Error(floorError.message)
    if (!floor) return NextResponse.json({ success: false, error: "Floor not found." }, { status: 404 })

    const { count, error: countError } = await supabaseCloudAdmin
      .from("tables").select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId).eq("floor", floor.name)
    if (countError) throw new Error(countError.message)
    if ((count || 0) > 0) {
      return NextResponse.json({ success: false, error: `Cannot delete "${floor.name}" because ${count} table(s) are assigned to it. Move or delete those tables first.` }, { status: 409 })
    }

    const { error } = await supabaseCloudAdmin
      .from("floors").delete().eq("id", id).eq("restaurant_id", restaurantId)
    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to delete floor" }, { status: 500 })
  }
}
