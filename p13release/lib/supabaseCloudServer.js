import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!url) throw new Error("Cloud Supabase URL is missing")
if (!key) throw new Error("Cloud Supabase service-role key is missing")

const SERVER_TIMEOUT_MS = 12000

async function serverFetch(input, init = {}) {
  if (init?.signal) return fetch(input, init)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("Cloud database request timed out")), SERVER_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Cloud-only server client used by the application control plane.
export const supabaseCloudAdmin = createClient(url, key, {
  global: { fetch: serverFetch },
  auth: { autoRefreshToken: false, persistSession: false },
})

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
if (!anonKey) throw new Error("Cloud Supabase anon key is missing")

// Server-side Cloud auth client. It never persists a session and is used only
// to validate bearer tokens against the same Cloud Supabase project.
export const supabaseCloudAuth = createClient(url, anonKey, {
  global: { fetch: serverFetch },
  auth: { autoRefreshToken: false, persistSession: false },
})
