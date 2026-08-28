import { createClient } from "@supabase/supabase-js"
import { getServerSupabaseRuntimeConfig } from "@/lib/runtimeSupabase"

const { url, key, mode } = getServerSupabaseRuntimeConfig()

console.log("Supabase server env check:", {
  mode,
  url: !!url,
  serviceRole: !!key,
})

if (!url) {
  throw new Error(
    `Supabase server URL is missing for ${mode} mode.`
  )
}

if (!key) {
  throw new Error(
    `Supabase service-role key is missing for ${mode} mode.`
  )
}

export const supabaseAdmin = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

export const supabaseServerRuntimeMode = mode
