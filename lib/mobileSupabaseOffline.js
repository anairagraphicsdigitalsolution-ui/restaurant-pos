import { mobileDbList, mobileDbPut, mobileDbRemove } from "@/lib/mobileLocalDb"

export function isAndroidRuntime() {
  if (typeof window === "undefined") return false
  return /Android/i.test(navigator.userAgent || "") || !!window.Capacitor?.Plugins?.AnairaLocalDb
}

export function shouldUseOfflineLocal() {
  return isAndroidRuntime() && typeof navigator !== "undefined" && navigator.onLine === false
}

function getRestaurantId() {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem("anaira.restaurant_id") || null
}

function project(row, selectSpec) {
  if (!selectSpec || selectSpec === "*") return { ...row }
  const cols = selectSpec.split(",").map(x => x.trim()).filter(Boolean)
  const out = {}
  for (const col of cols) {
    const name = col.split(":")[0].trim()
    if (name && Object.prototype.hasOwnProperty.call(row, name)) out[name] = row[name]
  }
  // Supabase nested select syntax is not reproducible locally without a relational engine.
  // Keep the base row rather than failing a whole page; core POS reads remain usable offline.
  return out
}

function applyFilters(rows, filters) {
  return rows.filter(row => filters.every(f => {
    const value = row?.[f.column]
    if (f.type === "eq") return String(value ?? "") === String(f.value ?? "")
    if (f.type === "neq") return String(value ?? "") !== String(f.value ?? "")
    if (f.type === "in") return f.values.includes(value) || f.values.map(String).includes(String(value))
    return true
  }))
}

async function tableRows(table) {
  const rid = getRestaurantId()
  if (!rid) return []
  const rows = await mobileDbList(rid, table).catch(() => [])
  if (rows.length) return rows

  // Common Phase-1/2 snapshot entities used by the POS.
  const snapshotEntity = {
    menu_items: "menu",
    tables: "tables",
    rooms: "rooms",
    modifier_groups: "modifier_groups",
    modifiers: "modifiers",
    menu_item_modifier_groups: "modifier_links",
    delivery_zones: "delivery_zones",
  }[table]
  if (snapshotEntity) {
    const snap = await mobileDbList(rid, snapshotEntity).catch(() => [])
    const one = snap.find(x => x && x.id === "snapshot")
    if (Array.isArray(one?.data)) return one.data
    if (Array.isArray(one)) return one
  }
  return []
}

function result(data = [], error = null) {
  return Promise.resolve({ data, error })
}

export function createOfflineFrom(table) {
  const state = {
    table,
    select: "*",
    filters: [],
    ordering: [],
    max: null,
  }

  const builder = {
    select(spec = "*") { state.select = spec; return builder },
    eq(column, value) { state.filters.push({ type: "eq", column, value }); return builder },
    neq(column, value) { state.filters.push({ type: "neq", column, value }); return builder },
    in(column, values) { state.filters.push({ type: "in", column, values: Array.isArray(values) ? values : [] }); return builder },
    order(column, options = {}) { state.ordering.push({ column, ascending: options.ascending !== false }); return builder },
    limit(value) { state.max = Number(value); return builder },
    async maybeSingle() { const r = await execute(); return { data: r.data[0] || null, error: r.data.length > 1 ? { message: "Multiple rows returned" } : r.error } },
    async single() { const r = await execute(); return { data: r.data[0] || null, error: r.data.length === 1 ? r.error : { message: r.data.length ? "Expected one row" : "No rows found" } } },
    async insert(values) {
      const rows = Array.isArray(values) ? values : [values]
      for (const row of rows) {
        const id = row?.id || crypto.randomUUID()
        const rid = row?.restaurant_id || getRestaurantId()
        if (!rid) continue
        await mobileDbPut(rid, table, id, { ...row, id, restaurant_id: rid, updated_at: row.updated_at || new Date().toISOString() })
      }
      return { data: rows, error: null }
    },
    async update(values) {
      const rid = getRestaurantId()
      const rows = await executeRows()
      for (const row of rows) {
        await mobileDbPut(rid, table, row.id, { ...row, ...values, updated_at: new Date().toISOString() })
      }
      return { data: rows.map(r => ({ ...r, ...values })), error: null }
    },
    async upsert(values) {
      const rows = Array.isArray(values) ? values : [values]
      const rid = getRestaurantId()
      for (const row of rows) {
        const id = row?.id || row?.order_id || row?.restaurant_id || crypto.randomUUID()
        await mobileDbPut(rid, table, id, { ...row, id, restaurant_id: row.restaurant_id || rid, updated_at: new Date().toISOString() })
      }
      return { data: rows, error: null }
    },
    async delete() {
      const rid = getRestaurantId()
      const rows = await executeRows()
      for (const row of rows) if (row?.id) await mobileDbRemove(rid, table, row.id)
      return { data: rows, error: null }
    },
    then(resolve, reject) { return execute().then(resolve, reject) },
  }

  async function executeRows() {
    let rows = await tableRows(table)
    rows = applyFilters(rows, state.filters)
    for (const o of state.ordering) {
      rows = [...rows].sort((a, b) => {
        const av = a?.[o.column]; const bv = b?.[o.column]
        const at = new Date(av || 0).getTime(); const bt = new Date(bv || 0).getTime()
        if (Number.isFinite(at) && Number.isFinite(bt) && (at || bt)) return o.ascending ? at - bt : bt - at
        return o.ascending ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? ""))
      })
    }
    if (Number.isFinite(state.max) && state.max > 0) rows = rows.slice(0, state.max)
    return rows
  }

  async function execute() {
    try {
      const rows = await executeRows()
      return { data: rows.map(r => project(r, state.select)), error: null }
    } catch (error) {
      return { data: [], error: { message: error?.message || "Offline local query failed" } }
    }
  }

  return builder
}
