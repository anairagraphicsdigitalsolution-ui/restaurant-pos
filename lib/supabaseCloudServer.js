import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!url) throw new Error("Cloud Supabase URL is missing")
if (!key) throw new Error("Cloud Supabase service-role key is missing")

// Explicit cloud control-plane client. This is intentionally separate from
// supabaseServer.js because a restaurant PC may run in local-primary mode
// while synchronization still needs authenticated access to the cloud.
export const supabaseCloudAdmin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})
