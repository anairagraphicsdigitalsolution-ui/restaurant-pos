import crypto from "crypto"

export const CASHFREE_API_VERSION = "2025-01-01"

export function cashfreeBaseUrl(environment="sandbox"){
  return String(environment).toLowerCase() === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg"
}

export function cashfreeHeaders(config={}, extra={}){
  return {
    accept:"application/json",
    "content-type":"application/json",
    "x-api-version":String(config.api_version || CASHFREE_API_VERSION),
    "x-client-id":String(config.client_id || "").trim(),
    "x-client-secret":String(config.client_secret || "").trim(),
    ...extra
  }
}

export function requireCashfreeCredentials(config={}){
  if(!String(config.client_id||"").trim()) throw new Error("Cashfree Client ID / App ID is missing")
  if(!String(config.client_secret||"").trim()) throw new Error("Cashfree Secret Key is missing")
}

export async function cashfreeRequest(path,{config={},method="GET",body=null,headers={}}={}){
  requireCashfreeCredentials(config)
  const url=`${cashfreeBaseUrl(config.environment)}/${String(path).replace(/^\/+/,"")}`
  const response=await fetch(url,{
    method,
    headers:cashfreeHeaders(config,headers),
    body:body===null?undefined:JSON.stringify(body)
  })
  const text=await response.text()
  let data=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!response.ok){
    const message=data?.message || data?.error_description || data?.error || text || `Cashfree API ${response.status}`
    throw new Error(`Cashfree API ${response.status}: ${String(message).slice(0,800)}`)
  }
  return data
}

export function verifyCashfreeWebhook(rawBody,timestamp,signature,secret){
  if(!rawBody || !timestamp || !signature || !secret) return false
  const expected=crypto.createHmac("sha256",secret).update(`${timestamp}${rawBody}`).digest("base64")
  const a=Buffer.from(String(expected))
  const b=Buffer.from(String(signature))
  return a.length===b.length && crypto.timingSafeEqual(a,b)
}

export function normalizeCashfreeStatus(status){
  const value=String(status||"").toUpperCase()
  if(value==="SUCCESS") return "SUCCESS"
  if(["FAILED","USER_DROPPED","VOID","CANCELLED"].includes(value)) return value
  if(value==="NOT_ATTEMPTED") return "NOT_ATTEMPTED"
  return "PENDING"
}
