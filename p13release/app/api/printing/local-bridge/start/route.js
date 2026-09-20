import { NextResponse } from "next/server"
import { spawn } from "node:child_process"
import path from "node:path"
import fs from "node:fs"

export const runtime = "nodejs"

function isWindows() {
  return process.platform === "win32"
}

async function waitForBridge(timeoutMs = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch("http://127.0.0.1:3211/health", { cache: "no-store" })
      if (r.ok) return true
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return false
}

export async function POST() {
  if (!isWindows()) {
    return NextResponse.json({ success: false, error: "Local Windows print bridge can only run on Windows." }, { status: 400 })
  }

  try {
    if (await waitForBridge(500)) {
      return NextResponse.json({ success: true, started: true, alreadyRunning: true })
    }

    const root = process.cwd()
    const bridge = path.join(root, "scripts", "print-bridge", "AnairaPrintBridge.ps1")
    if (!fs.existsSync(bridge)) {
      return NextResponse.json({ success: false, error: `Anaira Print Bridge script not found: ${bridge}` }, { status: 500 })
    }

    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-WindowStyle", "Hidden",
      "-File", bridge,
    ], {
      cwd: root,
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    })
    child.unref()

    if (await waitForBridge(5000)) {
      return NextResponse.json({ success: true, started: true, alreadyRunning: false })
    }

    return NextResponse.json({
      success: false,
      error: "Anaira Print Bridge could not be started. Run scripts\\print-bridge\\START-ANAIRA-PRINT-BRIDGE.bat once to see the Windows error.",
    }, { status: 500 })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to start Anaira Print Bridge" }, { status: 500 })
  }
}
