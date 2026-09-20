import { localDbEnabled, localJson, localSql, sqlText } from "@/lib/localDb"
import { requireLocalRestaurant } from "@/lib/localTenant"

export const runtime = "nodejs"

export async function GET(req) {
  try {
    if (!localDbEnabled()) throw new Error("Local database is disabled")
    const u = new URL(req.url)
    const { restaurantId: rid } = await requireLocalRestaurant(
      req,
      u.searchParams.get("restaurant_id")
    )

    const rows = await localJson(`
      SELECT
        o.*,
        COALESCE(
          json_agg(oi ORDER BY oi.id)
          FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.restaurant_id = ${sqlText(rid)}
        AND o.status IN ('pending','preparing','done')
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `)

    return Response.json({ success: true, orders: rows })
  } catch (e) {
    return Response.json(
      { success: false, error: e.message },
      { status: 400 }
    )
  }
}

export async function PATCH(req) {
  try {
    if (!localDbEnabled()) throw new Error("Local database is disabled")

    const b = await req.json()
    const id = String(b.order_id || "").trim()
    const status = String(b.status || "").toLowerCase()

    const { restaurantId: rid } = await requireLocalRestaurant(
      req,
      String(b.restaurant_id || "").trim() || null
    )

    if (
      !id ||
      !["pending", "preparing", "done", "cancelled"].includes(status)
    ) {
      throw new Error("Invalid order status")
    }

    await localSql(`
      UPDATE orders
      SET
        status = ${sqlText(status)},
        updated_at = now(),
        cancelled_at = ${status === "cancelled" ? "now()" : "NULL"}
      WHERE id = ${sqlText(id)}
        AND restaurant_id = ${sqlText(rid)};

      INSERT INTO local_sync_outbox(
        entity,
        entity_id,
        operation,
        restaurant_id,
        payload
      )
      SELECT
        'orders',
        id,
        'upsert',
        restaurant_id,
        jsonb_build_object(
          'id', id,
          'status', status,
          'updated_at', updated_at
        )
      FROM orders
      WHERE id = ${sqlText(id)}
        AND restaurant_id = ${sqlText(rid)}
      ON CONFLICT DO NOTHING;
    `)

    return Response.json({ success: true })
  } catch (e) {
    return Response.json(
      { success: false, error: e.message },
      { status: 400 }
    )
  }
}
