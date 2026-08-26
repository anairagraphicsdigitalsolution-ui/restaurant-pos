import { supabaseAdmin } from "@/lib/supabaseServer"

export async function hasStaffPermission(user, restaurantId, permissionKey) {
  const role = String(user?.role || "").toLowerCase()
  if (["admin", "super_admin"].includes(role)) return true
  if (role !== "staff" || !user?.id || !restaurantId || !permissionKey) return false
  const { data } = await supabaseAdmin
    .from("staff_permissions")
    .select("enabled")
    .eq("restaurant_id", restaurantId)
    .eq("staff_id", user.id)
    .eq("permission_key", permissionKey)
    .maybeSingle()
  return data?.enabled === true
}

export async function requireStaffPermission(user, restaurantId, permissionKey) {
  if (!(await hasStaffPermission(user, restaurantId, permissionKey))) {
    throw new Error(`Staff permission required: ${permissionKey}`)
  }
}
