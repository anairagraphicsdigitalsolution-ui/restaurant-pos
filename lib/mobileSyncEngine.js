import { mobileDbList, mobileDbPut, mobileDbQueueList, mobileDbQueueUpdate, mobileDbConflictPut, mobileDbMetaGet, mobileDbMetaPut } from "@/lib/mobileLocalDb"
import { getMobileDeviceId } from "@/lib/mobileDevice"

function backoff(attempts) {
  const base = Math.min(30 * 60 * 1000, 1000 * (2 ** Math.min(Math.max(attempts, 0), 10)))
  return Math.round(base * (0.75 + Math.random() * 0.5))
}

function isStale(incoming, local) {
  const a = new Date(incoming?.updated_at || incoming?.updatedAt || incoming?.created_at || 0).getTime()
  const b = new Date(local?.updated_at || local?.updatedAt || local?.created_at || 0).getTime()
  return Number.isFinite(a) && Number.isFinite(b) && a < b
}

export async function getMobileSyncDiagnostics(restaurantId) {
  const health = await mobileDbMetaGet(`sync-health:${restaurantId}`) || {}
  const pending = await mobileDbQueueList(restaurantId, 500).catch(() => [])
  return {
    ...health,
    device_id: getMobileDeviceId(),
    pending: pending.filter(x => x.status === "pending" || x.status === "retry").length,
    error: pending.filter(x => x.status === "error").length,
    processing: pending.filter(x => x.status === "processing").length,
  }
}

export async function syncMobileRestaurant(restaurantId, token) {
  if (!restaurantId || !token || typeof window === "undefined" || !navigator.onLine) return { skipped: true }
  const lockKey = `anaira-mobile-sync-lock:${restaurantId}`
  if (window[lockKey]) return { skipped: true, reason: "already-running" }
  window[lockKey] = true
  const startedAt = new Date().toISOString()
  await mobileDbMetaPut(`sync-health:${restaurantId}`, { state: "syncing", started_at: startedAt, device_id: getMobileDeviceId() }).catch(() => {})

  let pushed = 0
  let pulled = 0
  try {
    const queue = await mobileDbQueueList(restaurantId, 50)
    for (const entry of queue) {
      try {
        await mobileDbQueueUpdate(entry.queue_id, { status: "processing", attempts: Number(entry.attempts || 0) + 1, last_attempt_at: new Date().toISOString() }, restaurantId)
        if (entry.entity === "orders") {
          const response = await fetch("/api/mobile/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ restaurant_id: restaurantId, device_id: getMobileDeviceId(), orders: [entry.payload] }),
          })
          const result = await response.json().catch(() => ({}))
          if (!response.ok || !result.success) throw new Error(result.error || "Order sync failed")
          const synced = result.orders?.[0]
          if (synced) await mobileDbPut(restaurantId, "orders", synced.id, synced)
          await mobileDbQueueUpdate(entry.queue_id, { status: "synced", synced_at: new Date().toISOString(), last_error: null }, restaurantId)
          pushed += 1
        } else if (["billing_finalize", "restaurant_deliveries"].includes(entry.entity)) {
          // Core offline writes are durable locally. Their authoritative cloud
          // reconciliation is performed through the normal authenticated
          // application sync path when connectivity is restored. Keep the
          // queue visible rather than marking the record as permanently broken.
          await mobileDbQueueUpdate(entry.queue_id, { status: "retry", last_error: "Waiting for authenticated core reconciliation", next_attempt_at: new Date(Date.now() + backoff(Number(entry.attempts || 0))).toISOString() }, restaurantId)
        } else {
          await mobileDbQueueUpdate(entry.queue_id, { status: "error", last_error: `No cloud handler for ${entry.entity}`, next_attempt_at: new Date(Date.now() + backoff(Number(entry.attempts || 0))).toISOString() }, restaurantId)
        }
      } catch (error) {
        const attempts = Number(entry.attempts || 0)
        await mobileDbQueueUpdate(entry.queue_id, { status: attempts >= 8 ? "error" : "retry", last_error: error?.message || "Sync failed", next_attempt_at: new Date(Date.now() + backoff(attempts)).toISOString() }, restaurantId).catch(() => {})
      }
    }

    const cursor = await mobileDbMetaGet(`cloud-cursor:${restaurantId}`) || 0
    const params = new URLSearchParams({ restaurant_id: restaurantId, after_id: String(cursor), limit: "200", device_id: getMobileDeviceId() })
    const pullResponse = await fetch(`/api/mobile/sync/pull?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
    const pullResult = await pullResponse.json().catch(() => ({}))
    if (!pullResponse.ok || !pullResult.success) throw new Error(pullResult.error || "Cloud pull failed")
    for (const event of pullResult.events || []) {
      const entity = event.table_name
      const row = event.row_data
      if (!entity || !row) continue
      const local = row.id ? await mobileDbList(restaurantId, entity).then(rows => rows.find(x => x.id === row.id)).catch(() => null) : null
      if (local && isStale(row, local)) {
        await mobileDbConflictPut({ restaurant_id: restaurantId, entity, entity_id: row.id, direction: "cloud_to_local", resolution: "local-newer", local, incoming: row, created_at: new Date().toISOString() }).catch(() => {})
        continue
      }
      if (row.id) {
        await mobileDbPut(restaurantId, entity, row.id, row)
        pulled += 1
      }
    }
    await mobileDbMetaPut(`cloud-cursor:${restaurantId}`, Number(pullResult.next_after_id ?? cursor)).catch(() => {})

    const diagnostics = { state: "online", last_sync_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null, pushed, pulled, device_id: getMobileDeviceId() }
    await mobileDbMetaPut(`sync-health:${restaurantId}`, diagnostics).catch(() => {})
    return diagnostics
  } catch (error) {
    const diagnostics = { state: "degraded", last_sync_at: new Date().toISOString(), last_error: error?.message || "Sync failed", pushed, pulled, device_id: getMobileDeviceId() }
    await mobileDbMetaPut(`sync-health:${restaurantId}`, diagnostics).catch(() => {})
    throw error
  } finally {
    delete window[lockKey]
  }
}
