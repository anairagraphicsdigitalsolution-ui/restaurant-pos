import { localDbEnabled, localJson, sqlText } from "@/lib/localDb"
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
        AND lower(trim(o.status)) = 'done'
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 500
    `)

    return Response.json({ success: true, orders: rows })
  } catch (e) {
    return Response.json(
      { success: false, error: e.message },
      { status: 400 }
    )
  }
}
