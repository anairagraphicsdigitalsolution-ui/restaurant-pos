function cleanBase(value) {
  const base = String(value || "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(base)) throw new Error("Valid http/https domain is required")
  return base
}

export function getQRUrl({ type, id, domain, slug } = {}) {
  const safeType = String(type || "").trim()
  const safeId = String(id || "").trim()
  if (!safeType || !safeId) throw new Error("QR type and id are required")
  const base = cleanBase(domain)
  const safeSlug = String(slug || "").trim().replace(/^\/+|\/+$/g, "")
  if (safeSlug) {
    return `${base}/${encodeURIComponent(safeSlug)}/order/${encodeURIComponent(safeType)}/${encodeURIComponent(safeId)}`
  }
  // Keep legacy URLs working for callers that have not yet supplied a
  // restaurant slug. New QR print flows should always provide the slug.
  return `${base}/order?type=${encodeURIComponent(safeType)}&id=${encodeURIComponent(safeId)}`
}
