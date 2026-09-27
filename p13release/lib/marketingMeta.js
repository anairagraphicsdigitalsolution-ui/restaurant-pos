import crypto from "crypto"

const enc = new TextEncoder()
const key = () => {
  const raw = process.env.MARKETING_TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!raw) throw new Error("MARKETING_TOKEN_ENCRYPTION_KEY is not configured")
  return crypto.createHash("sha256").update(raw).digest()
}

export function encryptMarketingToken(value) {
  if (!value) return ""
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv)
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`
}

export function decryptMarketingToken(value) {
  if (!value) return ""
  if (!String(value).startsWith("v1.")) return String(value)
  const [,ivB64,tagB64,dataB64] = String(value).split(".")
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64,"base64url"))
  decipher.setAuthTag(Buffer.from(tagB64,"base64url"))
  return Buffer.concat([decipher.update(Buffer.from(dataB64,"base64url")), decipher.final()]).toString("utf8")
}

export function signOAuthState(payload) {
  const body = Buffer.from(JSON.stringify({...payload, exp: Math.floor(Date.now()/1000)+600})).toString("base64url")
  const sig = crypto.createHmac("sha256", key()).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function verifyOAuthState(state) {
  const [body,sig] = String(state||"").split(".")
  if (!body || !sig) throw new Error("Invalid OAuth state")
  const expected = crypto.createHmac("sha256", key()).update(body).digest("base64url")
  const sigBuf=Buffer.from(sig); const expectedBuf=Buffer.from(expected)
  if (sigBuf.length!==expectedBuf.length || !crypto.timingSafeEqual(sigBuf,expectedBuf)) throw new Error("Invalid OAuth state signature")
  const payload = JSON.parse(Buffer.from(body,"base64url").toString("utf8"))
  if (!payload.exp || payload.exp < Math.floor(Date.now()/1000)) throw new Error("OAuth state expired")
  return payload
}

export function metaGraphBase() {
  const version = process.env.META_GRAPH_VERSION || "v24.0"
  return `https://graph.facebook.com/${version}`
}

export async function metaJson(path, params={}, {method="GET"}={}) {
  const url = new URL(`${metaGraphBase()}/${String(path).replace(/^\//,"")}`)
  const init = {method,headers:{"Content-Type":"application/x-www-form-urlencoded"}}
  if (method === "GET") Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null)url.searchParams.set(k,String(v))})
  else init.body = new URLSearchParams(params)
  const res = await fetch(url,init)
  const data = await res.json().catch(()=>({}))
  if (!res.ok || data.error) throw new Error(data.error?.message || `Meta API request failed (${res.status})`)
  return data
}

export function isMarketingTokenExpired(expiresAt, skewSeconds=120) {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  return Number.isFinite(t) && t <= Date.now() + skewSeconds * 1000
}
