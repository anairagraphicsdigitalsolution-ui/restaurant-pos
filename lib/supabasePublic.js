import { createClient } from "@supabase/supabase-js"
import {
  getCloudSupabaseConfig,
  getLocalSupabaseConfig,
  isLocalSupabasePrimary,
} from "@/lib/runtimeSupabase"

const cloud = getCloudSupabaseConfig()
const local = getLocalSupabaseConfig()

if (!cloud.url || !cloud.anonKey) {
  throw new Error("Cloud Supabase configuration is missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.")
}

// Cloud client is ALWAYS the authentication/control-plane client.
export const supabaseCloud = createClient(cloud.url, cloud.anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

const localDataClient =
  isLocalSupabasePrimary() && local.url && local.serviceRoleKey
    ? createClient(local.url, local.serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      })
    : null

const cloudDataClient = createClient(cloud.url, cloud.anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

function isSuperAdminRoute() {
  if (typeof window === "undefined") return false
  const path = window.location.pathname || ""
  return path === "/super-admin" || path.startsWith("/super-admin/")
}

function dataClient() {
  if (isLocalSupabasePrimary() && localDataClient && !isSuperAdminRoute()) {
    return localDataClient
  }
  return cloudDataClient
}

// Compatibility facade: existing restaurant pages keep using `supabase.from()`
// while auth always remains Cloud. In local-primary mode restaurant data is
// therefore stored/read from the local Supabase stack.
export const supabasePublic = {
  auth: supabaseCloud.auth,
  from: (...args) => dataClient().from(...args),
  storage: new Proxy({}, {
    get(_target, property) {
      return dataClient().storage[property]
    },
  }),
  rpc: (fn, args, options) => {
    // Subscription/plan is SaaS control-plane data and must come from Cloud.
    if (fn === "get_restaurant_plan") {
      return supabaseCloud.rpc(fn, args, options)
    }
    return dataClient().rpc(fn, args, options)
  },
  channel: (...args) => dataClient().channel(...args),
  removeChannel: (...args) => dataClient().removeChannel(...args),
  removeAllChannels: (...args) => dataClient().removeAllChannels(...args),
  getChannels: (...args) => dataClient().getChannels(...args),
}

export const supabasePublicRuntimeMode = isLocalSupabasePrimary() ? "local-primary" : "cloud"
