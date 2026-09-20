import {NextResponse} from "next/server"
export const runtime="nodejs"
export async function GET(req){const u=new URL(req.url);return NextResponse.redirect(new URL(`/api/marketing/meta/oauth/start?platform=${encodeURIComponent(u.searchParams.get("platform")||"")}`,u.origin))}
