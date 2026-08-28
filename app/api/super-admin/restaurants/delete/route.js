import { supabaseCloudAdmin as supabaseAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function DELETE(req) {
  try {
    const user = await requireApiUser(req)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile || profile.role !== "super_admin") {
      return Response.json({ success: false, error: "Super Admin access required" }, { status: 403 })
    }

    const body = await req.json()
    const restaurantId = String(body?.restaurant_id || "").trim()
    if (!restaurantId) {
      return Response.json({ success: false, error: "restaurant_id is required" }, { status: 400 })
    }

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .select("id,name,owner_id,logo")
      .eq("id", restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return Response.json({ success: false, error: "Restaurant not found" }, { status: 404 })
    }

    const [{ data: restaurantProfiles }, { data: ownerRows }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,role").eq("restaurant_id", restaurantId),
      supabaseAdmin.from("restaurants").select("owner_id").eq("id", restaurantId).not("owner_id", "is", null),
    ])

    const candidateUserIds = new Set([
      ...(restaurantProfiles || []).filter((p) => p.role !== "super_admin").map((p) => p.id),
      ...(ownerRows || []).map((r) => r.owner_id).filter(Boolean),
    ])

    const { data: deleteResult, error: deleteError } = await supabaseAdmin.rpc(
      "delete_restaurant_cascade",
      { p_restaurant_id: restaurantId }
    )

    if (deleteError) {
      console.error("RESTAURANT CASCADE DELETE ERROR:", deleteError)
      return Response.json({ success: false, error: deleteError.message || "Restaurant deletion failed" }, { status: 400 })
    }

    const authUsersDeleted = []
    const authDeleteErrors = []

    for (const userId of candidateUserIds) {
      if (userId === user.id) continue

      const [{ data: remainingProfile }, { data: remainingOwnedRestaurant }] = await Promise.all([
        supabaseAdmin.from("profiles").select("id,role").eq("id", userId).maybeSingle(),
        supabaseAdmin.from("restaurants").select("id").eq("owner_id", userId).limit(1).maybeSingle(),
      ])

      if (remainingProfile?.role === "super_admin" || remainingOwnedRestaurant || remainingProfile) continue

      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (authDeleteError) authDeleteErrors.push({ user_id: userId, error: authDeleteError.message })
      else authUsersDeleted.push(userId)
    }

    // Logo uploads use <restaurant_id>/... paths.
    try {
      const { data: logoFiles } = await supabaseAdmin.storage.from("logos").list(restaurantId, { limit: 1000 })
      const paths = (logoFiles || []).filter((file) => file?.name).map((file) => `${restaurantId}/${file.name}`)
      if (paths.length) await supabaseAdmin.storage.from("logos").remove(paths)
    } catch (storageError) {
      console.warn("RESTAURANT LOGO CLEANUP WARNING:", storageError)
    }

    return Response.json({
      success: true,
      restaurant_id: restaurantId,
      restaurant_name: restaurant.name,
      deleted: deleteResult || {},
      auth_users_deleted: authUsersDeleted.length,
      auth_delete_warnings: authDeleteErrors,
    })
  } catch (error) {
    console.error("SUPER ADMIN RESTAURANT DELETE API ERROR:", error)
    return Response.json({ success: false, error: error?.message || "Restaurant deletion failed" }, { status: 500 })
  }
}
