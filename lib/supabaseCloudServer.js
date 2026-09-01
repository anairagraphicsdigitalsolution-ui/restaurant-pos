import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!url) throw new Error("Cloud Supabase URL is missing")
if (!key) throw new Error("Cloud Supabase service-role key is missing")

// Cloud-only server client used by the application control plane.
export const supabaseCloudAdmin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
if (!anonKey) throw new Error("Cloud Supabase anon key is missing")

// Server-side Cloud auth client. It never persists a session and is used only
// to validate bearer tokens against the same Cloud Supabase project.
export const supabaseCloudAuth = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
