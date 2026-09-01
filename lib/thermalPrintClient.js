import { supabaseCloud } from "@/lib/supabaseCloud"

export async function sendThermalPrint({ type = "receipt", content = "", data = {} } = {}) {
  const { data: sessionData } = await supabaseCloud.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error("Login session expired")
  const response = await fetch("/api/printing/print", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ printer_code: "thermal-printing", type, content, data })
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.success !== true) {
    throw new Error(result?.error || "Thermal print failed")
  }
  return result
}
