import { NextResponse } from "next/server"

const ACTION_ALIASES = {
  hold: "hold_order",
  park: "hold_order",
  reopen: "reopen_order",
  transfer_table: "table_transfer",
}

// Backward-compatible route kept for older dashboard callers. The Operations
// Hub route is canonical so business logic and audit logging cannot diverge.
export async function POST(req) {
  try {
    const body = await req.json()
    const action = String(body.action || "").trim()
    const payload = { ...body, action: ACTION_ALIASES[action] || action }
    const { POST: canonicalPost } = await import("@/app/api/restaurant-operations/route")
    return canonicalPost(new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(payload),
    }))
  } catch (e) {
    console.error("restaurant operations compatibility", e)
    return NextResponse.json({ success: false, error: e?.message || "Operation failed" }, { status: 400 })
  }
}
