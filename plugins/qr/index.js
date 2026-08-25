function cleanBase(value) {
  const base = String(value || "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(base)) throw new Error("Valid http/https domain is required")
  return base
}

export function getQRUrl({ type, id, domain } = {}) {
  const safeType = String(type || "").trim()
  const safeId = String(id || "").trim()
  if (!safeType || !safeId) throw new Error("QR type and id are required")
  const base = cleanBase(domain)
  return `${base}/order?type=${encodeURIComponent(safeType)}&id=${encodeURIComponent(safeId)}`
}
