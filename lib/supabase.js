import { createClient } from "@supabase/supabase-js"
import {
  getCloudSupabaseConfig,
  getLocalSupabaseConfig,
  isLocalSupabasePrimary,
} from "@/lib/runtimeSupabase"

const cloud = getCloudSupabaseConfig()
const local = getLocalSupabaseConfig()

if (!cloud.url || !cloud.anonKey) {
  throw new Error(
    "Cloud Supabase configuration is missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  )
}

// Cloud authentication/control-plane client
export const supabaseCloud = createClient(cloud.url, cloud.anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// Local data client.
// NOTE: local service-role key is intentionally used server-side only.
// Browser bundles must not expose service-role secrets.
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

  return (
    path === "/super-admin" ||
    path.startsWith("/super-admin/")
  )
}

function getDataClient() {
  if (
    isLocalSupabasePrimary() &&
    localDataClient &&
    !isSuperAdminRoute()
  ) {
    return localDataClient
  }

  return cloudDataClient
}

// Keep auth on Cloud.
// Data client is local-primary for restaurant users,
// cloud for Super Admin.
export const supabase = new Proxy(
  supabaseCloud,
  {
    get(target, property, receiver) {
      if (property === "auth") {
        return Reflect.get(target, property, receiver)
      }

      if (property === "from") {
        return (...args) => getDataClient().from(...args)
      }

      if (property === "storage") {
        return getDataClient().storage
      }

      if (property === "rpc") {
        return (fn, args, options) => {
          if (fn === "get_restaurant_plan") {
            return supabaseCloud.rpc(fn, args, options)
          }

          return getDataClient().rpc(fn, args, options)
        }
      }

      if (property === "channel") {
        return (...args) => getDataClient().channel(...args)
      }

      if (property === "removeChannel") {
        return (...args) => getDataClient().removeChannel(...args)
      }

      if (property === "removeAllChannels") {
        return (...args) => getDataClient().removeAllChannels(...args)
      }

      if (property === "getChannels") {
        return (...args) => getDataClient().getChannels(...args)
      }

      return Reflect.get(target, property, receiver)
    },
  }
)

export const supabaseRuntimeMode =
  isLocalSupabasePrimary()
    ? "local-primary"
    : "cloud"