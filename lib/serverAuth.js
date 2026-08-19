import { supabaseAdmin } from "@/lib/supabaseServer"

export async function requireApiUser(req) {
  const header = req.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""

  if (!token) {
    throw new Error("Authentication required")
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !data?.user) {
    throw new Error("Invalid or expired session")
  }

  return data.user
}
