import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { localDbEnabled, localSql, localJson, sqlJson, sqlText } from "@/lib/localDb"

const CORE = [
  "restaurants",
  "tables",
  "rooms",
  "menu_items",
  "orders",
  "order_items",
  "customers",
  "inventory",
  "inventory_transactions",
  "restaurant_plugins",
  "plugin_settings",
  "reservations",
  "print_jobs",
  "invoice_sequences",
  "restaurant_banners",
]

function tableColumns(rows) {
  return rows.length ? Object.keys(rows[0]) : []
}
function sqlValue(v) {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "object") return sqlJson(v)
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE"
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL"
  return sqlText(v)
}

async function upsertRows(table, rows) {
  if (!rows?.length) return 0
  const cols = tableColumns(rows)
  if (!cols.includes("id") && table !== "invoice_sequences") return 0
  const colSql = cols.map(c => `"${c.replaceAll('"','')}"`).join(",")
  const values = rows.map(row => `(${cols.map(c => sqlValue(row[c])).join(",")})`).join(",\n")
  const conflict = table === "invoice_sequences" ? "restaurant_id" : "id"
  await localSql(`INSERT INTO "${table}" (${colSql}) VALUES ${values} ON CONFLICT ("${conflict}") DO UPDATE SET ${cols.filter(c => c !== conflict).map(c => `"${c}"=EXCLUDED."${c}"`).join(",")};`, { syncApply: true })
  return rows.length
}

export async function pullRestaurantToLocal(restaurantId) {
  if (!localDbEnabled()) throw new Error("Local database is not enabled")
  let total = 0
  for (const table of CORE) {
    if (table === "restaurants") {
      const { data, error } = await supabaseCloudAdmin.from(table).select("*").eq("id", restaurantId).maybeSingle()
      if (!error && data) total += await upsertRows(table, [data])
      else if (error) console.warn(`Local sync pull skipped ${table}:`, error.message)
      continue
    }
    const query = supabaseCloudAdmin.from(table).select("*").eq("restaurant_id", restaurantId)
    const { data, error } = await query
    if (error) {
      // Some tables may not exist in an older cloud schema; skip them without breaking the snapshot.
      console.warn(`Local sync pull skipped ${table}:`, error.message)
      continue
    }
    total += await upsertRows(table, data || [])
  }
  await localSql(`UPDATE local_sync_state SET mode='online', last_online_at=now(), last_sync_at=now(), pending_count=(SELECT count(*) FROM local_sync_outbox WHERE status='pending'), last_error=NULL, updated_at=now() WHERE id=true;`)
  return { tables: CORE.length, rows: total }
}

export async function localSyncStatus() {
  if (!localDbEnabled()) return { enabled:false, mode:"cloud" }
  return (await localJson("SELECT * FROM local_sync_state LIMIT 1"))[0] || { enabled:true, mode:"local", pending_count:0 }
}
