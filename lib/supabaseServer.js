import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url) throw new Error("Cloud Supabase URL is missing.")
if (!key) throw new Error("Cloud Supabase service-role key is missing.")

export const supabaseAdmin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})
export const supabaseServerRuntimeMode = "cloud"
