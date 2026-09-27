import { NextResponse } from "next/server"
import { getTerminalId, getLocalServerConfig } from "@/lib/localServer"

export async function GET() {
  const config = getLocalServerConfig()
  return NextResponse.json({
    terminalId: getTerminalId(),
    localServerEnabled: config.enabled,
    deviceType: "pos",
    offlineEnabled: true,
  }, { headers: { "Cache-Control": "no-store" } })
}
