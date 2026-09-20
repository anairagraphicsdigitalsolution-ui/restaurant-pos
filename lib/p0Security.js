import "server-only"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { rateLimit, rateLimitResponse, rejectOversizedRequest } from "@/lib/publicRateLimit"

export function securityGuard(req, scope, { limit = 60, maxBytes = 256 * 1024 } = {}) {
  const oversized = rejectOversizedRequest(req, maxBytes)
  if (oversized) return oversized
  const result = rateLimit(req, scope, limit)
  if (!result.ok) return rateLimitResponse(result)
  return null
}

export async function writeSecurityAudit({ restaurantId = null, userId = null, action, route, outcome = "success", metadata = {} }) {
  try {
    await supabaseCloudAdmin.from("p0_api_security_audit").insert({
      restaurant_id: restaurantId,
      user_id: userId,
      action: String(action || "api_request").slice(0, 120),
      route: String(route || "").slice(0, 300),
      outcome: String(outcome || "success").slice(0, 40),
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    })
  } catch (error) {
    console.error("P0 API SECURITY AUDIT ERROR:", error)
  }
}
