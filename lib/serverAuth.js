import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

export async function requireApiUser(req) {
  const header = req.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""

  if (!token) {
    throw new Error("Authentication required")
  }

  // All application API requests authenticate against Cloud Supabase.
  const { data, error } = await supabaseCloudAdmin.auth.getUser(token)

  if (error || !data?.user) {
    throw new Error("Invalid or expired session")
  }

  const user = data.user
  const { data: profile } = await supabaseCloudAdmin
    .from("profiles")
    .select("role, restaurant_id")
    .eq("id", user.id)
    .maybeSingle()

  // Keep the canonical application role/tenant on the authenticated user object
  // so every server API uses the same authorization context.
  if (profile) {
    user.role = profile.role || user.role || ""
    user.restaurant_id = profile.restaurant_id || null
  }

  return user
}
