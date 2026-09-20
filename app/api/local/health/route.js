import { NextResponse } from "next/server"
import { getLocalServerConfig } from "@/lib/localServer"

export async function GET() {
  const config = getLocalServerConfig()
  return NextResponse.json({
    ok: true,
    localServer: config.enabled,
    time: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } })
}
