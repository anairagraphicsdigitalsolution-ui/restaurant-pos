import { NextResponse } from "next/server"
import { spawn } from "node:child_process"
import path from "node:path"

let child = null

export async function POST() {
  if (process.platform !== "win32") {
    return NextResponse.json({ success: false, error: "Anaira Windows Print Bridge is only available on Windows." }, { status: 400 })
  }
  if (child && !child.killed) return NextResponse.json({ success: true, alreadyRunning: true })

  const script = path.join(process.cwd(), "scripts", "print-bridge", "AnairaPrintBridge.ps1")
  try {
    child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    })
    child.unref()
    child.on("exit", () => { child = null })
    return NextResponse.json({ success: true, started: true, elevated: false, transport: "tcp-http" })
  } catch (e) {
    child = null
    return NextResponse.json({ success: false, error: e?.message || "Unable to start Anaira Print Bridge" }, { status: 500 })
  }
}
