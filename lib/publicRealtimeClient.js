import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Public QR pages must never participate in the application's persisted Auth
// session. Keeping this client auth-less prevents public menu/tracking pages
// from contending for Supabase's browser auth lock.
let client = null

export function getPublicRealtimeClient() {
  if (typeof window === "undefined" || !url || !anonKey) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}

export async function getQrRealtimeTopic(token) {
  if (!token || typeof window === "undefined" || !window.crypto?.subtle) return ""
  const bytes = new TextEncoder().encode(String(token))
  const digest = await window.crypto.subtle.digest("SHA-256", bytes)
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
  return `qr-track:${hash}`
}
