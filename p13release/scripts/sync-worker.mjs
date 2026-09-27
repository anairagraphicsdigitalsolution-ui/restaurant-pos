import { spawn } from "node:child_process"

const cloudUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")
let cloudKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const cloudAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
let cloudAccessToken = process.env.SUPABASE_ACCESS_TOKEN || ""
let cloudRefreshToken = process.env.SUPABASE_REFRESH_TOKEN || ""
let cloudTokenExpiresAt = 0
const restaurantId = process.env.ANAIRA_RESTAURANT_ID || ""
const nodeBase = process.env.ANAIRA_SYNC_NODE || "restaurant-local-server"
const nodeName = `${nodeBase}:${restaurantId}`
const interval = Math.max(1000, Number(process.env.ANAIRA_SYNC_INTERVAL_MS || 5000))
const batchSize = Math.min(200, Math.max(1, Number(process.env.ANAIRA_SYNC_BATCH_SIZE || 100)))

const localContainer = process.env.LOCAL_DB_CONTAINER || "supabase-db"
const localUser = process.env.LOCAL_DB_USER || "supabase_admin"
const localDb = process.env.LOCAL_DB_NAME || "postgres"

const SYNC_TABLES = [
  "restaurants", "tables", "rooms", "menu_items", "orders", "order_items", "kot_tickets",
  "customers", "inventory", "inventory_transactions", "restaurant_plugins",
  "plugin_settings", "reservations", "print_jobs", "invoice_sequences",
  "restaurant_banners"
]

if (!cloudUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required")
if (!cloudKey && !cloudAccessToken) throw new Error("A cloud service-role key or authenticated access token is required")
if (!restaurantId) throw new Error("ANAIRA_RESTAURANT_ID is required")

function dockerArgs(sql) {
  return ["exec", "-i", localContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", localUser, "-d", localDb, "-At", "-F", "\t", "-c", sql]
}

function localSql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", dockerArgs(sql), { windowsHide: true })
    let stdout = "", stderr = ""
    child.stdout.on("data", b => { stdout += b.toString() })
    child.stderr.on("data", b => { stderr += b.toString() })
    child.on("error", reject)
    child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `Local SQL failed (${code})`)))
  })
}

async function localJson(sql) {
  const raw = await localSql(`SELECT COALESCE(json_agg(x),'[]'::json) FROM (${String(sql).trim().replace(/;+\s*$/, "")}) x;`)
  return raw ? JSON.parse(raw) : []
}

function sqlText(value) {
  if (value === null || value === undefined) return "NULL"
  return `'${String(value).replaceAll("'", "''")}'`
}
function sqlJson(value) {
  return `${sqlText(JSON.stringify(value ?? {}))}::jsonb`
}
function qi(name) { return `"${String(name).replaceAll('"','""')}"` }
function allowedTable(table) { return SYNC_TABLES.includes(table) }

function jwtExpiry(token) {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return 0
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64url').toString('utf8')
    return Number(JSON.parse(json)?.exp || 0)
  } catch { return 0 }
}

async function refreshCloudSession(force = false) {
  if (!cloudRefreshToken || !cloudAnonKey) return false
  const now = Math.floor(Date.now() / 1000)
  if (!force && cloudAccessToken && cloudTokenExpiresAt - now > 300) return true
  const response = await fetch(`${cloudUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: cloudAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: cloudRefreshToken })
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch {}
  if (!response.ok || !body?.access_token) throw new Error(`Cloud session refresh failed: ${response.status}`)
  cloudAccessToken = body.access_token
  cloudRefreshToken = body.refresh_token || cloudRefreshToken
  cloudTokenExpiresAt = Number(body.expires_at || jwtExpiry(cloudAccessToken) || 0)
  return true
}

async function cloudFetch(path, options = {}) {
  if (!cloudKey) await refreshCloudSession(false)
  const apikey = cloudKey || cloudAnonKey
  const bearer = cloudKey || cloudAccessToken
  if (!apikey || !bearer) throw new Error("Cloud authentication is unavailable")
  const response = await fetch(`${cloudUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) {
    const message = typeof body === "string" ? body : body?.message || body?.hint || JSON.stringify(body)
    throw new Error(`Cloud HTTP ${response.status}: ${message}`)
  }
  return body
}

async function getState(column) {
  const allowed = new Set(["last_pushed_id", "last_pulled_id"])
  if (!allowed.has(column)) throw new Error("Invalid sync state column")
  const rows = await localJson(`SELECT ${column} AS cursor FROM public.anaira_sync_state WHERE node_name=${sqlText(nodeName)} LIMIT 1`)
  return Number(rows[0]?.cursor || 0)
}
async function setState(column, value) {
  const allowed = new Set(["last_pushed_id", "last_pulled_id"])
  if (!allowed.has(column)) throw new Error("Invalid sync state column")
  await localSql(`UPDATE public.anaira_sync_state SET ${column}=${Number(value)},updated_at=clock_timestamp() WHERE node_name=${sqlText(nodeName)};`)
}
async function ensureState() {
  await localSql(`CREATE TABLE IF NOT EXISTS public.anaira_sync_state (node_name text PRIMARY KEY,last_pushed_id bigint NOT NULL DEFAULT 0,last_pulled_id bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()); INSERT INTO public.anaira_sync_state(node_name,last_pushed_id,last_pulled_id) VALUES (${sqlText(nodeName)},0,0) ON CONFLICT(node_name) DO NOTHING;`)
  await localSql(`CREATE TABLE IF NOT EXISTS public.local_sync_state (id boolean PRIMARY KEY DEFAULT true,mode text NOT NULL DEFAULT 'local' CHECK(mode IN ('local','online','syncing','error')),last_online_at timestamptz,last_sync_at timestamptz,pending_count integer NOT NULL DEFAULT 0,last_error text,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()); INSERT INTO public.local_sync_state(id) VALUES(true) ON CONFLICT(id) DO NOTHING;`)
}
async function pendingCount() {
  const cursor = await getState("last_pushed_id")
  const rows = await localJson(`SELECT count(*)::int AS count FROM public.anaira_sync_events WHERE id>${cursor} AND restaurant_id=${sqlText(restaurantId)} AND table_name=ANY(ARRAY[${SYNC_TABLES.map(sqlText).join(',')}]::text[])`)
  return Number(rows[0]?.count || 0)
}
async function updateRuntimeState(mode, errorMessage = null) {
  const pending = await pendingCount()
  await localSql(`UPDATE public.local_sync_state SET mode=${sqlText(mode)},last_online_at=CASE WHEN ${sqlText(mode)}='online' THEN now() ELSE last_online_at END,last_sync_at=now(),pending_count=${pending},last_error=${errorMessage === null ? 'NULL' : sqlText(errorMessage)},updated_at=now() WHERE id=true;`)
}

async function localEvents(cursor) {
  return localJson(`SELECT id,source_node,schema_name,table_name,operation,primary_key,row_data,restaurant_id,changed_at,created_at FROM public.anaira_sync_events WHERE id>${cursor} AND restaurant_id=${sqlText(restaurantId)} AND table_name=ANY(ARRAY[${SYNC_TABLES.map(sqlText).join(',')}]::text[]) ORDER BY id ASC LIMIT ${batchSize}`)
}

async function cloudUpsert(table, row) {
  if (!allowedTable(table)) throw new Error(`Blocked sync table: ${table}`)

  const normalized = { ...(row || {}) }

  if (
    table === "menu_items" &&
    (normalized.item_type === null ||
      normalized.item_type === undefined ||
      normalized.item_type === "")
  ) {
    normalized.item_type = "single"
  }

  // Cloud orders schema requires these charge fields to be non-null.
  if (table === "orders") {
    if (
      normalized.service_charge === null ||
      normalized.service_charge === undefined ||
      normalized.service_charge === ""
    ) {
      normalized.service_charge = 0
    }

    if (
      normalized.packaging_charge === null ||
      normalized.packaging_charge === undefined ||
      normalized.packaging_charge === ""
    ) {
      normalized.packaging_charge = 0
    }

    if (
      normalized.delivery_charge === null ||
      normalized.delivery_charge === undefined ||
      normalized.delivery_charge === ""
    ) {
      normalized.delivery_charge = 0
    }
  }

  await cloudFetch(table, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(normalized)
  })

}
async function cloudRpc(functionName, body) {
  if (!cloudKey) await refreshCloudSession(false)
  const apikey = cloudKey || cloudAnonKey
  const bearer = cloudKey || cloudAccessToken
  if (!apikey || !bearer) throw new Error("Cloud authentication is unavailable")
  const response = await fetch(`${cloudUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  })
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload?.message || payload?.hint || JSON.stringify(payload)
    throw new Error(`Cloud RPC ${functionName} HTTP ${response.status}: ${message}`)
  }
  return payload
}

async function cloudOrderFinalization(orderId) {
  return cloudRpc("finalize_synced_order_numbers", { p_order_id: orderId })
}

async function refreshLocalOrderFromCloud(orderId) {
  const rows = await cloudFetch(`orders?id=eq.${encodeURIComponent(orderId)}&select=*`)
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) return null
  const local = JSON.stringify(row).replaceAll("\\", "\\\\").replaceAll("'", "''")
  await localSql(`WITH incoming AS (SELECT '${local}'::jsonb AS j) UPDATE public.orders o SET invoice_no=NULLIF(incoming.j->>'invoice_no',''), sync_status=COALESCE(NULLIF(incoming.j->>'sync_status',''),'synced'), cloud_received_at=NULLIF(incoming.j->>'cloud_received_at','')::timestamptz, invoice_generated_at=NULLIF(incoming.j->>'invoice_generated_at','')::timestamptz, kot_generated_at=NULLIF(incoming.j->>'kot_generated_at','')::timestamptz, updated_at=now() FROM incoming WHERE o.id=${sqlText(orderId)};`, { syncApply: true })
  return row
}

async function cloudDelete(table, pk) {
  if (!allowedTable(table)) throw new Error(`Blocked sync table: ${table}`)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(pk || {})) params.set(key, `eq.${String(value)}`)
  await cloudFetch(`${table}?${params.toString()}`, { method: "DELETE", headers: { Prefer: "return=minimal" } })
}
async function pumpLocalToCloud() {
  let cursor = await getState("last_pushed_id")
  const events = await localEvents(cursor)
  let processed = 0
  for (const ev of events) {
    try {
      if (ev.schema_name !== "public" || !allowedTable(ev.table_name) || !ev.primary_key || !Object.keys(ev.primary_key).length) { cursor = Number(ev.id); await setState("last_pushed_id", cursor); continue }
      if (ev.operation === "DELETE") await cloudDelete(ev.table_name, ev.primary_key)
      else if (ev.operation === "INSERT" || ev.operation === "UPDATE") {
        const row = { ...(ev.row_data || {}) }
        if (ev.table_name === "orders") {
          if (!row.id) throw new Error("Offline order is missing its UUID")
          if (!row.invoice_no || ["PENDING","SYNCING","LOCAL"].includes(String(row.invoice_no).trim().toUpperCase())) row.invoice_no = null
          row.sync_status = "pending"
          row.offline_created_at = row.offline_created_at || row.created_at || null
        }
        await cloudUpsert(ev.table_name, row)
        if (ev.table_name === "orders") {
          const finalized = await cloudOrderFinalization(row.id)
          await refreshLocalOrderFromCloud(row.id)
          if (finalized?.invoice_no) console.log(new Date().toISOString(), "OFFLINE BILL FINALIZED", row.id, finalized.invoice_no, finalized.kot_no ?? "")
        }
      } else { cursor = Number(ev.id); await setState("last_pushed_id", cursor); continue }
      cursor = Number(ev.id); await setState("last_pushed_id", cursor); processed++
      console.log(new Date().toISOString(), "LOCAL -> CLOUD OK", ev.id, ev.table_name, ev.operation)
    } catch (e) {
      console.error(new Date().toISOString(), "LOCAL -> CLOUD FAILED", ev.id, ev.table_name, e.message)
      break
    }
  }
  return processed
}

async function cloudEvents(cursor) {
  const params = new URLSearchParams({
    select: "id,source_node,schema_name,table_name,operation,primary_key,row_data,restaurant_id,changed_at,created_at",
    id: `gt.${cursor}`,
    restaurant_id: `eq.${restaurantId}`,
    table_name: `in.(${SYNC_TABLES.join(',')})`,
    order: "id.asc",
    limit: String(batchSize)
  })
  return (await cloudFetch(`anaira_sync_events?${params.toString()}`)) || []
}

async function localApplyEvent(ev) {
  if (!allowedTable(ev.table_name)) throw new Error(`Blocked sync table: ${ev.table_name}`)
  const table = ev.table_name
  const pk = ev.primary_key || {}
  const pkKeys = Object.keys(pk)
  if (!pkKeys.length) return
  if (ev.operation === "DELETE") {
    const where = pkKeys.map(k => `${qi(k)}=${sqlText(pk[k])}`).join(" AND ")
    await localSql(`SET app.sync_apply='true'; SET app.sync_node=${sqlText(nodeName)}; DELETE FROM public.${qi(table)} WHERE ${where};`)
    return
  }
  const row = { ...(ev.row_data || {}) }
  if (table === "menu_items" && (row.item_type === null || row.item_type === undefined || row.item_type === "")) row.item_type = "single"
  const cols = Object.keys(row)
  if (!cols.length) return
  const meta = await localJson(`SELECT column_name,is_generated,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=${sqlText(table)} AND is_generated='NEVER' ORDER BY ordinal_position`)
  const usable = meta.map(x => x.column_name).filter(c => Object.prototype.hasOwnProperty.call(row,c))
  if (!usable.length) return
  const insertCols = usable.map(qi).join(",")
  const pkName = pkKeys[0]
  if (pkKeys.length !== 1) throw new Error(`Composite primary key is not supported: ${table}`)
  const updates = usable.filter(c => c !== pkName).map(c => `${qi(c)}=EXCLUDED.${qi(c)}`).join(",")
  const sql = `SET app.sync_apply='true'; SET app.sync_node=${sqlText(nodeName)}; INSERT INTO public.${qi(table)} (${insertCols}) VALUES (${usable.map(c => sqlValueForJson(row[c], meta, c)).join(",")}) ON CONFLICT (${qi(pkName)}) DO UPDATE SET ${updates || `${qi(pkName)}=EXCLUDED.${qi(pkName)}`};`
  await localSql(sql)
}
function sqlValueForJson(value) {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL"
  if (typeof value === "object") return sqlJson(value)
  return sqlText(value)
}

async function pumpCloudToLocal() {
  let cursor = await getState("last_pulled_id")
  const events = await cloudEvents(cursor)
  let processed = 0
  for (const ev of events) {
    try {
      if (ev.source_node === nodeName) { cursor = Number(ev.id); await setState("last_pulled_id", cursor); processed++; continue }
      await localApplyEvent(ev)
      cursor = Number(ev.id); await setState("last_pulled_id", cursor); processed++
      console.log(new Date().toISOString(), "CLOUD -> LOCAL OK", ev.id, ev.table_name, ev.operation)
    } catch (e) {
      console.error(new Date().toISOString(), "CLOUD -> LOCAL FAILED", ev.id, ev.table_name, e.message)
      break
    }
  }
  return processed
}

cloudTokenExpiresAt = jwtExpiry(cloudAccessToken)
await refreshCloudSession(false).catch(() => {})
await ensureState()
console.log("============================================")
console.log(" Anaira POS - Automatic Bidirectional Sync")
console.log("============================================")
console.log("Restaurant:", restaurantId)
console.log("Node:", nodeName)
console.log("Interval:", `${interval}ms`)
console.log("Cloud:", cloudUrl)
console.log("Press Ctrl+C to stop.")

while (true) {
  try {
    await updateRuntimeState("syncing")
    const push = await pumpLocalToCloud()
    const pull = await pumpCloudToLocal()
    await updateRuntimeState("online")
    console.log(new Date().toISOString(), "SYNC OK", `local->cloud:${push}`, `cloud->local:${pull}`, `pending:${await pendingCount()}`)
  } catch (e) {
    console.error(new Date().toISOString(), "SYNC ERROR:", e.message)
    try { await updateRuntimeState("error", e.message) } catch {}
  }
  await new Promise(r => setTimeout(r, interval))
}
