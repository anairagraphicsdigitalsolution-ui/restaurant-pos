import "server-only"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireFeature } from "@/lib/featureGateServer"

const API_FEATURE_GATES = [
  ["/api/banquet", "p2-banquet-events"],
  ["/api/call-center", "p2-call-center"],
  ["/api/customer-display", "p2-customer-display"],
  ["/api/device-hq", "p2-device-hq"],
  ["/api/kiosks", "p2-advanced-kiosk"],
  ["/api/ai-intelligence", "p2-ai-intelligence"],
  ["/api/enterprise", "p1-enterprise-hq"],
  ["/api/supplier", "p1-supplier-automation"],
  ["/api/supplier-portal", "p1-supplier-portal"],
  ["/api/marketing", "p1-marketing-hub"],
  ["/api/reservations", "reservations-pro"],
  ["/api/kds/advanced", "kds"],
  ["/api/printing", "thermal-printing"],
  ["/api/gift-cards", "restaurant-suite"],
  ["/api/payments/reconciliation", "payment-accounts"],
]

function featureForPath(pathname = "") {
  return API_FEATURE_GATES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || null
}

export async function requireApiUser(req) {
  const header = req.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""

  if (!token) {
    throw new Error("Authentication required")
  }

  // All application API requests authenticate against Cloud Supabase.
  const { data, error } = await supabaseCloudAdmin.auth.getUser(token)

  if (error || !data?.user) {
    throw new Error("Invalid or expired session")
  }

  const user = data.user
  const { data: profile, error: profileError } = await supabaseCloudAdmin
    .from("profiles")
    .select("role, restaurant_id")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("API profile lookup failed", {
      userId: user.id,
      message: profileError.message,
      code: profileError.code,
      details: profileError.details,
      hint: profileError.hint,
    })
    throw new Error(`Application profile lookup failed: ${profileError.message}`)
  }

  // Keep the canonical application role/tenant on the authenticated user object
  // so every server API uses the same authorization context.
  if (!profile) {
    throw new Error("Application profile not found")
  }

  user.role = profile.role || ""
  user.restaurant_id = profile.restaurant_id || null

  // Enforce premium/optional module gates at the shared API authentication boundary.
  // Public/webhook/local/super-admin routes do not enter this map.
  const pathname = (() => { try { return new URL(req.url).pathname } catch { return "" } })()
  const feature = featureForPath(pathname)
  if (feature && user.role !== "super_admin" && user.restaurant_id) {
    await requireFeature(user.restaurant_id, feature)
  }

  return user
}
