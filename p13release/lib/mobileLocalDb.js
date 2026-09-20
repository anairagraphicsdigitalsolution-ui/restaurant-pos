const DB_NAME = "anaira-mobile-local"
const DB_VERSION = 11
const LEGACY_STORE = "records"
const RECORD_STORE = "records"
const QUEUE_STORE = "sync_queue"
const CONFLICT_STORE = "conflicts"
const META_STORE = "meta"

function nativePlugin() {
  if (typeof window === "undefined") return null
  return window.Capacitor?.Plugins?.AnairaLocalDb || null
}

function upgradeDb(db) {
  if (!db.objectStoreNames.contains(RECORD_STORE)) {
    const store = db.createObjectStore(RECORD_STORE, { keyPath: "key" })
    store.createIndex("restaurant_id", "restaurant_id", { unique: false })
    store.createIndex("entity", "entity", { unique: false })
    store.createIndex("updated_at", "updated_at", { unique: false })
  }
  if (!db.objectStoreNames.contains(QUEUE_STORE)) {
    const store = db.createObjectStore(QUEUE_STORE, { keyPath: "queue_id" })
    store.createIndex("restaurant_id", "restaurant_id", { unique: false })
    store.createIndex("status", "status", { unique: false })
    store.createIndex("next_attempt_at", "next_attempt_at", { unique: false })
  }
  if (!db.objectStoreNames.contains(CONFLICT_STORE)) {
    const store = db.createObjectStore(CONFLICT_STORE, { keyPath: "id" })
    store.createIndex("restaurant_id", "restaurant_id", { unique: false })
  }
  if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" })

  // Preserve legacy v1 data without deleting anything.
  if (db.objectStoreNames.contains(LEGACY_STORE) && LEGACY_STORE !== RECORD_STORE) {
    try {
      const legacy = db.transaction(LEGACY_STORE, "readonly").objectStore(LEGACY_STORE)
      const current = db.transaction(RECORD_STORE, "readwrite").objectStore(RECORD_STORE)
      const request = legacy.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        const value = cursor.value
        if (value?.key) current.put({ ...value, updated_at: value.updated_at || new Date().toISOString() })
        cursor.continue()
      }
    } catch {}
  }
}

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Local database unavailable"))
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => upgradeDb(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("Local database open failed"))
  })
}

export async function mobileDbOpen(restaurantId) {
  const native = nativePlugin()
  if (native?.open) return native.open({ restaurantId, version: DB_VERSION })
  const db = await openIndexedDb()
  db.close()
  return { success: true, driver: "indexeddb", restaurantId, version: DB_VERSION }
}

function keyFor(restaurantId, entity, id) {
  return `${restaurantId}:${entity}:${id}`
}

export async function mobileDbPut(restaurantId, entity, id, data) {
  const native = nativePlugin()
  if (native?.put) return native.put({ restaurantId, entity, id, data })
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, "readwrite")
    tx.objectStore(RECORD_STORE).put({ key: keyFor(restaurantId, entity, id), restaurant_id: restaurantId, entity, id, data, updated_at: new Date().toISOString() })
    tx.oncomplete = () => { db.close(); resolve({ success: true }) }
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Local write failed")) }
  })
}

export async function mobileDbGet(restaurantId, entity, id) {
  const native = nativePlugin()
  if (native?.get) return native.get({ restaurantId, entity, id })
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, "readonly")
    const request = tx.objectStore(RECORD_STORE).get(keyFor(restaurantId, entity, id))
    request.onsuccess = () => { db.close(); resolve(request.result?.data || null) }
    request.onerror = () => { db.close(); reject(request.error || new Error("Local read failed")) }
  })
}

export async function mobileDbList(restaurantId, entity) {
  const native = nativePlugin()
  if (native?.list) {
    const result = await native.list({ restaurantId, entity })
    return result?.records || []
  }
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, "readonly")
    const request = tx.objectStore(RECORD_STORE).getAll()
    request.onsuccess = () => {
      db.close()
      resolve((request.result || []).filter(row => row.restaurant_id === restaurantId && row.entity === entity).map(row => row.data))
    }
    request.onerror = () => { db.close(); reject(request.error || new Error("Local list failed")) }
  })
}

export async function mobileDbRemove(restaurantId, entity, id) {
  const native = nativePlugin()
  if (native?.remove) return native.remove({ restaurantId, entity, id })
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, "readwrite")
    tx.objectStore(RECORD_STORE).delete(keyFor(restaurantId, entity, id))
    tx.oncomplete = () => { db.close(); resolve({ success: true }) }
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Local delete failed")) }
  })
}

export async function mobileDbQueuePut(entry) {
  const normalized = {
    queue_id: entry.queue_id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `q-${Date.now()}-${Math.random()}`),
    ...entry,
    status: entry.status || "pending",
    attempts: Number(entry.attempts || 0),
    created_at: entry.created_at || new Date().toISOString(),
    next_attempt_at: entry.next_attempt_at || new Date().toISOString(),
  }
  const native = nativePlugin()
  if (native?.put) return native.put({ restaurantId: normalized.restaurant_id, entity: "sync_queue", id: normalized.queue_id, data: normalized })
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite")
    tx.objectStore(QUEUE_STORE).put(normalized)
    tx.oncomplete = () => { db.close(); resolve(normalized) }
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Sync queue write failed")) }
  })
}

export async function mobileDbQueueList(restaurantId, limit = 100) {
  const native = nativePlugin()
  if (native?.list) {
    const result = await native.list({ restaurantId, entity: "sync_queue", limit })
    return result?.records || []
  }
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly")
    const request = tx.objectStore(QUEUE_STORE).getAll()
    request.onsuccess = () => {
      db.close()
      const now = Date.now()
      resolve((request.result || [])
        .filter(x => x.restaurant_id === restaurantId && ["pending", "retry", "error"].includes(x.status) && new Date(x.next_attempt_at || 0).getTime() <= now)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(0, limit))
    }
    request.onerror = () => { db.close(); reject(request.error || new Error("Sync queue read failed")) }
  })
}

export async function mobileDbQueueUpdate(queueId, patch, restaurantId = "") {
  const native = nativePlugin()
  if (native?.get && native?.put && restaurantId) {
    const current = await native.get({ restaurantId, entity: "sync_queue", id: queueId })
    return native.put({ restaurantId, entity: "sync_queue", id: queueId, data: { ...(current || {}), ...patch, queue_id: queueId } })
  }
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite")
    const store = tx.objectStore(QUEUE_STORE)
    const get = store.get(queueId)
    get.onsuccess = () => store.put({ ...(get.result || {}), ...patch, queue_id: queueId })
    tx.oncomplete = () => { db.close(); resolve({ success: true }) }
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Sync queue update failed")) }
  })
}

export async function mobileDbConflictPut(conflict) {
  const row = { id: conflict.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}`), ...conflict }
  const native = nativePlugin()
  if (native?.put) return native.put({ restaurantId: row.restaurant_id, entity: "conflicts", id: row.id, data: row })
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFLICT_STORE, "readwrite")
    tx.objectStore(CONFLICT_STORE).put(row)
    tx.oncomplete = () => { db.close(); resolve(row) }
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Conflict write failed")) }
  })
}

export async function mobileDbMetaGet(key) {
  const native = nativePlugin()
  if (native?.get) {
    const row = await native.get({ restaurantId: "__meta__", entity: "meta", id: key }).catch(() => null)
    return row?.value ?? row?.data?.value ?? null
  }
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly")
    const request = tx.objectStore(META_STORE).get(key)
    request.onsuccess = () => { db.close(); resolve(request.result?.value ?? null) }
    request.onerror = () => { db.close(); reject(request.error || new Error("Local metadata read failed")) }
  })
}

export async function mobileDbMetaPut(key, value) {
  const native = nativePlugin()
  if (native?.put) return native.put({ restaurantId: "__meta__", entity: "meta", id: key, data: { value } })
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite")
    tx.objectStore(META_STORE).put({ key, value })
    tx.oncomplete = () => { db.close(); resolve(value) }
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Local metadata write failed")) }
  })
}
