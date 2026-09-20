/**
 * Supabase runtime configuration.
 *
 * Local restaurant installations use two planes:
 *   - Cloud: authentication + SaaS control-plane/subscription data.
 *   - Local: restaurant operational data on the restaurant PC.
 */
function isLocalPrimary() {
  return (
    process.env.NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY === "true" ||
    process.env.ANAIRA_LOCAL_PRIMARY === "true"
  )
}

export function getCloudSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  }
}

export function getLocalSupabaseConfig() {
  return {
    url:
      process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL ||
      process.env.ANAIRA_LOCAL_SUPABASE_URL ||
      "",
    anonKey:
      process.env.NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY ||
      process.env.ANAIRA_LOCAL_SUPABASE_ANON_KEY ||
      "",
    serviceRoleKey:
      process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ||
      process.env.ANAIRA_LOCAL_SUPABASE_SERVICE_ROLE_KEY ||
      "",
  }
}

export function getSupabaseRuntimeConfig() {
  const cloud = getCloudSupabaseConfig()
  const local = getLocalSupabaseConfig()

  if (isLocalPrimary() && local.url && (local.anonKey || local.serviceRoleKey)) {
    return { url: local.url, key: local.anonKey || local.serviceRoleKey, mode: "local" }
  }

  return { url: cloud.url, key: cloud.anonKey, mode: "cloud" }
}

export function getServerSupabaseRuntimeConfig() {
  const cloud = getCloudSupabaseConfig()
  const local = getLocalSupabaseConfig()

  if (isLocalPrimary() && local.url && local.serviceRoleKey) {
    return { url: local.url, key: local.serviceRoleKey, mode: "local" }
  }

  return { url: cloud.url, key: cloud.serviceRoleKey, mode: "cloud" }
}

export function isLocalSupabasePrimary() {
  return isLocalPrimary()
}
