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

  return data.user
}
