import { NextResponse } from "next/server"
import { getLocalServerConfig } from "@/lib/localServer"

export async function GET() {
  const config = getLocalServerConfig()
  return NextResponse.json({
    localServerEnabled: config.enabled,
    deviceType: "pos",
    offlineEnabled: true,
  }, { headers: { "Cache-Control": "no-store" } })
}
