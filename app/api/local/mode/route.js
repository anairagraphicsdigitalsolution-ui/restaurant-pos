import { getLocalServerConfig } from "@/lib/localServer"
import { localSyncStatus } from "@/lib/localSync"
export const runtime="nodejs"
export async function GET(){ const c=getLocalServerConfig(); return Response.json({enabled:c.enabled,mode:c.enabled?(await localSyncStatus()).mode:"cloud"},{headers:{"Cache-Control":"no-store"}}) }
