import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json()

    const inventoryId = String(body?.inventory_id || "").trim()
    const delta = Number(body?.delta)
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : "Manual adjustment"

    if (!inventoryId || !Number.isInteger(delta) || delta === 0) {
      return Response.json({ success: false, error: "Invalid inventory adjustment" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc("stage3_adjust_inventory", {
      p_actor_id: user.id,
      p_inventory_id: inventoryId,
      p_delta: delta,
      p_reason: reason
    })

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 400 })
    }

    return Response.json({ success: true, inventory: data })
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || "Inventory update failed" },
      { status: 401 }
    )
  }
}
