import "server-only"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireFeature } from "@/lib/featureGateServer"

const API_FEATURE_GATES = [
  ["/api/banquet", "restaurant-pro"],
  ["/api/call-center", "restaurant-pro"],
  ["/api/customer-display", "digital-display"],
  ["/api/device-hq", "restaurant-pro"],
  ["/api/kiosks", "self-service-kiosk"],
  ["/api/ai-intelligence", "forecasting"],
  ["/api/enterprise", "multi-branch"],
  ["/api/supplier", "purchasing"],
  ["/api/supplier-portal", "purchasing"],
  ["/api/marketing", "campaigns"],
  ["/api/reservations", "reservations-pro"],
  ["/api/kds/advanced", "kds"],
  ["/api/printing", "thermal-printing"],
  ["/api/gift-cards", "wallet"],
  ["/api/payments/reconciliation", "online-reconciliation"],
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
  const { data: profile } = await supabaseCloudAdmin
    .from("profiles")
    .select("role, restaurant_id")
    .eq("id", user.id)
    .maybeSingle()

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
