import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

export async function requireApiUser(req) {
  const header = req.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""

  if (!token) {
    throw new Error("Authentication required")
  }

  // Restaurant/local API requests still authenticate against the Cloud
  // Supabase Auth service. Operational data itself is served by the local
  // database through supabaseServer.js when local-primary mode is enabled.
  const { data, error } = await supabaseCloudAdmin.auth.getUser(token)

  if (error || !data?.user) {
    throw new Error("Invalid or expired session")
  }

  return data.user
}
