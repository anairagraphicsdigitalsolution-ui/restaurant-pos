import { NextResponse } from "next/server"
import { getLocalServerConfig, getTerminalId } from "@/lib/localServer"

export async function GET() {
  const config = getLocalServerConfig()
  return NextResponse.json({
    ok: true,
    localServer: config.enabled,
    host: config.host,
    port: config.port,
    terminalId: getTerminalId(),
    hostname: process.env.HOSTNAME || null,
    time: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } })
}
