// Best-effort per-instance rate limiting for public routes.
// This is intentionally dependency-free. On horizontally scaled/serverless
// deployments, pair it with an edge/WAF or shared rate-limit service for
// cluster-wide enforcement.
const buckets = new Map()
const WINDOW_MS = 60_000

function clientKey(req) {
  const forwarded = req.headers.get("x-forwarded-for") || ""
  const ip = forwarded.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  return ip.slice(0, 120)
}

export function rateLimit(req, scope, limit) {
  const now = Date.now()
  const key = `${scope}:${clientKey(req)}`
  const current = buckets.get(key)

  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 })
    return { ok: true, remaining: Math.max(limit - 1, 0) }
  }

  current.count += 1
  if (current.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - current.startedAt)) / 1000)) }
  }

  // Avoid unbounded memory growth when this process handles many clients.
  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (now - bucket.startedAt >= WINDOW_MS) buckets.delete(bucketKey)
    }
  }

  return { ok: true, remaining: Math.max(limit - current.count, 0) }
}

export function rateLimitResponse(result) {
  return Response.json(
    { success: false, error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter || 60),
        "Cache-Control": "no-store"
      }
    }
  )
}

export function rejectOversizedRequest(req, maxBytes = 256 * 1024) {
  const length = Number(req.headers.get("content-length") || 0)
  if (Number.isFinite(length) && length > maxBytes) {
    return Response.json(
      { success: false, error: "Request is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    )
  }
  return null
}
