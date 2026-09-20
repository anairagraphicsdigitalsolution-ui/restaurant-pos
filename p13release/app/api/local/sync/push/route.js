import { localDbEnabled, localJson, localSql, sqlText } from "@/lib/localDb"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

// The database trigger records every local INSERT/UPDATE/DELETE in
// anaira_sync_events. This is the source of truth for bidirectional sync.
// Only restaurant-scoped events are allowed to leave a restaurant PC.
const BLOCKED = new Set([
  "anaira_sync_events",
  "anaira_sync_state",
  "local_sync_state",
  "local_sync_outbox",
])

function eventRestaurantId(row) {
  return row?.restaurant_id || null
}

function primaryKey(row) {
  const value = row?.primary_key
  return value && typeof value === "object" ? value : {}
}

export async function POST(req) {
  try {
    if (!localDbEnabled()) {
      return Response.json(
        { success: false, error: "Local database is disabled" },
        { status: 503 }
      )
    }

    const user = await requireApiUser(req)
    const { data: profile, error: profileError } = await supabaseCloudAdmin
      .from("profiles")
      .select("restaurant_id,role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) throw new Error(profileError.message)

    const linkedRestaurantId =
      profile?.restaurant_id ||
      user.user_metadata?.restaurant_id ||
      user.app_metadata?.restaurant_id ||
      null

    const requestedRestaurantId =
      new URL(req.url).searchParams.get("restaurant_id") ||
      linkedRestaurantId

    if (!requestedRestaurantId) {
      return Response.json({ success: false, error: "Restaurant not found" }, { status: 403 })
    }

    if (profile?.role !== "super_admin" && requestedRestaurantId !== linkedRestaurantId) {
      return Response.json({ success: false, error: "Restaurant access denied" }, { status: 403 })
    }

    const baseNode = process.env.ANAIRA_SYNC_NODE || "restaurant-local-server"
    const nodeName = `${baseNode}:${requestedRestaurantId}`

    await localSql(`
      INSERT INTO public.anaira_sync_state(node_name,last_pushed_id,last_pulled_id)
      VALUES (${sqlText(nodeName)},0,0)
      ON CONFLICT (node_name) DO NOTHING;
    `)

    const state = await localJson(`
      SELECT node_name,last_pushed_id,last_pulled_id
      FROM public.anaira_sync_state
      WHERE node_name=${sqlText(nodeName)}
      LIMIT 1
    `)
    let lastPushedId = Number(state[0]?.last_pushed_id || 0)

    const events = await localJson(`
      SELECT id,source_node,schema_name,table_name,operation,primary_key,row_data,restaurant_id,changed_at
      FROM public.anaira_sync_events
      WHERE id > ${lastPushedId}
        AND restaurant_id=${sqlText(requestedRestaurantId)}
        AND table_name NOT IN (${Array.from(BLOCKED).map(sqlText).join(",")})
      ORDER BY id ASC
      LIMIT 200
    `)

    let synced = 0
    let failed = 0
    let lastError = null

    for (const event of events) {
      try {
        if (event.schema_name !== "public" || !event.table_name || BLOCKED.has(event.table_name)) {
          lastPushedId = Number(event.id)
          continue
        }

        const table = supabaseCloudAdmin.from(event.table_name)
        const pk = primaryKey(event)

        if (!Object.keys(pk).length) {
          lastPushedId = Number(event.id)
          continue
        }

        if (event.operation === "DELETE") {
          const { error } = await table.delete().match(pk)
          if (error) throw error
        } else if (event.operation === "INSERT" || event.operation === "UPDATE") {
  if (!event.row_data) {
    throw new Error(`Missing row_data for ${event.operation}`)
  }

  const rowData = { ...event.row_data }

  // Cloud menu_items requires item_type.
  // Older/local records may have NULL, so normalize them
  // before pushing to Cloud.
  if (
    event.table_name === "menu_items" &&
    (rowData.item_type === null ||
      rowData.item_type === undefined ||
      rowData.item_type === "")
  ) {
    rowData.item_type = "single"
  }

  const { error } = await table.upsert(rowData)

  if (error) throw error
} else {
          lastPushedId = Number(event.id)
          continue
        }

        synced++
        lastPushedId = Number(event.id)
      } catch (error) {
        failed++
        lastError = error?.message || "Cloud sync failed"
        break
      }
    }

    await localSql(`
      UPDATE public.anaira_sync_state
      SET last_pushed_id=${lastPushedId}, updated_at=clock_timestamp()
      WHERE node_name=${sqlText(nodeName)};
    `)

    const pending = await localJson(`
      SELECT count(*)::int AS count
      FROM public.anaira_sync_events
      WHERE id > ${lastPushedId}
        AND restaurant_id=${sqlText(requestedRestaurantId)};
    `)

    const pendingCount = Number(pending[0]?.count || 0)

    await localSql(`
      UPDATE public.local_sync_state
      SET pending_count=${pendingCount},
          mode=${failed ? "'error'" : "'online'"},
          last_sync_at=clock_timestamp(),
          last_error=${failed ? sqlText(lastError) : "NULL"},
          updated_at=clock_timestamp()
      WHERE id=true;
    `)

    return Response.json({
      success: failed === 0,
      processed: events.length,
      synced,
      failed,
      pending: pendingCount,
      last_pushed_id: lastPushedId,
      error: lastError,
      status: await localJson("SELECT * FROM public.local_sync_state LIMIT 1"),
    }, { status: failed ? 409 : 200 })
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Local push failed" },
      { status: 400 }
    )
  }
}
