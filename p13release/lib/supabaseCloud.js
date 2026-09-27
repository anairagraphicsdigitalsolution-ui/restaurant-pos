import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// POS requests should fail fast enough to keep the desktop UI responsive.
// GET/HEAD requests are safe to retry once; mutations are never retried here.
const SUPABASE_REQUEST_TIMEOUT_MS = 20000
const SUPABASE_GET_RETRIES = 1

async function supabaseFetch(input, init = {}) {
  if (init?.signal) return fetch(input, init)

  // Supabase Auth manages its own persisted-session navigator lock. A custom
  // abort timer around auth requests can abort a lock-holder while another
  // auth request is waiting, producing the misleading "another request stole
  // it" / Lock broken errors. Let Auth own the lifecycle; data/API requests
  // still use our bounded timeout below.
  const requestUrl = typeof input === "string" ? input : input?.url || String(input || "")
  if (requestUrl.includes("/auth/v1/")) return fetch(input, init)

  const method = String(init?.method || "GET").toUpperCase()
  const retryable = method === "GET" || method === "HEAD"
  let lastError

  for (let attempt = 0; attempt <= (retryable ? SUPABASE_GET_RETRIES : 0); attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error("Supabase request timed out")), SUPABASE_REQUEST_TIMEOUT_MS)
    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } catch (error) {
      lastError = error
      if (attempt < (retryable ? SUPABASE_GET_RETRIES : 0)) {
        await new Promise(resolve => setTimeout(resolve, 350))
      }
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError
}

if (!url || !anonKey) {
  throw new Error("Cloud Supabase configuration is missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.")
}

export const supabaseCloud = createClient(url, anonKey, {
  global: { fetch: supabaseFetch },
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
})
