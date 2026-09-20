import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

export const dynamic = "force-dynamic"

const BRIDGE_URL = "http://127.0.0.1:3211"

async function bridgeStatus() {
  try {
    const response = await fetch(`${BRIDGE_URL}/status`, { cache: "no-store", signal: AbortSignal.timeout(1200) })
    const data = await response.json().catch(() => ({}))
    return response.ok && data?.running ? data : null
  } catch (_) { return null }
}

export async function GET() {
  const status = await bridgeStatus()
  return Response.json(status ? { success: true, ...status } : { success: false, running: false }, { status: status ? 200 : 503 })
}

export async function POST() {
  if (process.platform !== "win32") return Response.json({ success: false, error: "Local Windows print bridge is only available on Windows." }, { status: 400 })

  const existing = await bridgeStatus()
  if (existing) return Response.json({ success: true, started: false, ...existing })

  const script = path.join(process.cwd(), "scripts", "AnairaPrintBridge.ps1")
  if (!fs.existsSync(script)) return Response.json({ success: false, error: `Anaira Print Bridge script not found: ${script}` }, { status: 500 })

  try {
    // HttpListener may require elevation/URL ACL on Windows. Start the bridge elevated
    // so the local POS does not depend on a manual PowerShell launch.
    const psArgs = `-NoProfile -ExecutionPolicy Bypass -File "${script}"`
    const command = `$p=Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList '${psArgs.replaceAll("'", "''")}' -PassThru; Write-Output $p.Id`
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], { detached: true, windowsHide: false, stdio: "ignore" })
    child.unref()
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Unable to start Anaira Print Bridge." }, { status: 500 })
  }

  for (let i = 0; i < 30; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 300))
    const status = await bridgeStatus()
    if (status) return Response.json({ success: true, started: true, ...status })
  }

  return Response.json({
    success: false,
    error: "Anaira Print Bridge did not start. If Windows showed a UAC prompt, press Yes. Then retry CONNECT PRINTER. You can also run scripts\\install-anaira-print-bridge.ps1 once as Administrator.",
  }, { status: 503 })
}
