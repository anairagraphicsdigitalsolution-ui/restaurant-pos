const buckets = new Map()

export function rateLimit(key, { limit = 60, windowMs = 60_000 } = {}) {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || now - existing.startedAt >= windowMs) {
    buckets.set(key, { startedAt: now, count: 1 })
    return { allowed: true, remaining: limit - 1 }
  }
  existing.count += 1
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((windowMs - (now - existing.startedAt)) / 1000)),
    }
  }
  return { allowed: true, remaining: limit - existing.count }
}

export function clientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for") || ""
  return forwarded.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"
}
