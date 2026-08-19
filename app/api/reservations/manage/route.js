import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

function parseDateTime(date, time) {
  if (!date || !time) return null
  const value = new Date(`${date}T${time}:00+05:30`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json()
    const action = String(body?.action || "create").toLowerCase()

    if (action === "delete") {
      const reservationId = String(body?.reservation_id || "").trim()
      if (!reservationId) {
        return Response.json({ success: false, error: "Reservation is required" }, { status: 400 })
      }

      const { data, error } = await supabaseAdmin.rpc("stage3_delete_reservation", {
        p_actor_id: user.id,
        p_reservation_id: reservationId
      })

      if (error) return Response.json({ success: false, error: error.message }, { status: 400 })
      return Response.json({ success: true, reservation: data })
    }

    if (action === "status") {
      const reservationId = String(body?.reservation_id || "").trim()
      const status = String(body?.status || "").trim().toLowerCase()

      if (!reservationId || !["pending", "confirmed", "cancelled"].includes(status)) {
        return Response.json({ success: false, error: "Invalid reservation status" }, { status: 400 })
      }

      const { data, error } = await supabaseAdmin.rpc("stage3_update_reservation_status", {
        p_actor_id: user.id,
        p_reservation_id: reservationId,
        p_status: status
      })

      if (error) return Response.json({ success: false, error: error.message }, { status: 400 })
      return Response.json({ success: true, reservation: data })
    }

    const tableId = String(body?.table_id || "").trim()
    const startAt = parseDateTime(body?.date, body?.time)
    const duration = Math.max(1, Number(body?.duration || 60))
    const endAt = startAt ? new Date(new Date(startAt).getTime() + duration * 60000).toISOString() : null

    if (!tableId || !startAt || !endAt || !body?.name || !body?.phone) {
      return Response.json({ success: false, error: "Complete reservation details are required" }, { status: 400 })
    }

    const payload = {
      p_actor_id: user.id,
      p_table_id: tableId,
      p_start_at: startAt,
      p_end_at: endAt,
      p_name: String(body.name).trim().slice(0, 120),
      p_phone: String(body.phone).trim().slice(0, 40),
      p_guests: Math.max(1, Number(body.guests || 1)),
      p_notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null
    }

    const rpcName = action === "update" ? "stage3_update_reservation" : "stage3_create_reservation"

    if (action === "update") {
      payload.p_reservation_id = String(body.reservation_id || "").trim()
      if (!payload.p_reservation_id) {
        return Response.json({ success: false, error: "Reservation is required" }, { status: 400 })
      }
    }

    const { data, error } = await supabaseAdmin.rpc(rpcName, payload)

    if (error) return Response.json({ success: false, error: error.message }, { status: 400 })
    return Response.json({ success: true, reservation: data })
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || "Reservation failed" },
      { status: 401 }
    )
  }
}
