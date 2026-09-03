import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const SUPABASE_REQUEST_TIMEOUT_MS = 20000

async function supabaseFetch(input, init = {}) {
  // Electron can occasionally leave a network request pending for a very
  // long time. Bound Supabase HTTP requests so one stalled request cannot
  // make the POS UI appear frozen forever. AuthProvider preserves the session
  // when this timeout is transient.
  if (init?.signal) return fetch(input, init)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("Supabase request timed out")), SUPABASE_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

if (!url || !anonKey) {
  throw new Error("Cloud Supabase configuration is missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.")
}

export const supabaseCloud = createClient(url, anonKey, {
  global: { fetch: supabaseFetch },
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
})
