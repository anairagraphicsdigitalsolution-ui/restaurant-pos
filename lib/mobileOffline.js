import { mobileDbGet, mobileDbOpen, mobileDbPut } from "@/lib/mobileLocalDb"

const ENTITY = "offline_order"

export async function saveMobileOfflineOrder(order) {
  const restaurantId = order?.restaurant_id
  if (!restaurantId || !order?.id) throw new Error("Restaurant and order ID are required")
  await mobileDbOpen(restaurantId)
  await mobileDbPut(restaurantId, ENTITY, order.id, {
    ...order,
    invoice_no: order.invoice_no || "PENDING",
    sync_status: "pending",
    offline_created_at: order.offline_created_at || new Date().toISOString(),
  })
  return order
}

export async function getMobileOfflineOrder(restaurantId, orderId) {
  if (!restaurantId || !orderId) return null
  return mobileDbGet(restaurantId, ENTITY, orderId)
}

export async function syncMobileOfflineOrder(order, token) {
  if (!order?.restaurant_id || !order?.id) throw new Error("Invalid offline order")
  const response = await fetch("/api/mobile/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ restaurant_id: order.restaurant_id, orders: [order] }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) throw new Error(result.error || "Offline order sync failed")
  const synced = result.orders?.[0] || result.order || null
  if (synced) await mobileDbPut(order.restaurant_id, ENTITY, order.id, synced)
  return synced
}
