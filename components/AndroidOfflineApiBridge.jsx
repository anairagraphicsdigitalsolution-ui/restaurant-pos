"use client"

import { useEffect } from "react"
import { mobileDbList, mobileDbPut, mobileDbQueuePut } from "@/lib/mobileLocalDb"
import { getMobileDeviceId } from "@/lib/mobileDevice"

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function isAndroid() {
  return typeof window !== "undefined" && (/Android/i.test(navigator.userAgent || "") || !!window.Capacitor?.Plugins?.AnairaLocalDb)
}

function rid() {
  return typeof window === "undefined" ? null : window.localStorage.getItem("anaira.restaurant_id")
}

async function listEntity(restaurantId, entity) {
  return mobileDbList(restaurantId, entity).catch(() => [])
}

async function localOrder(orderId) {
  const restaurantId = rid()
  if (!restaurantId) return null
  const [orders, snapshots, offline] = await Promise.all([
    listEntity(restaurantId, "orders"),
    listEntity(restaurantId, "order_snapshot"),
    listEntity(restaurantId, "offline_order"),
  ])
  return [...orders, ...snapshots, ...offline].find(x => x?.id === orderId) || null
}

async function offlineCreateOrder(body) {
  const restaurantId = body.restaurant_id || rid()
  if (!restaurantId) return jsonResponse({ success: false, error: "Restaurant is not configured for offline use." }, 409)
  const id = body.id || crypto.randomUUID()
  const now = new Date().toISOString()
  const order = {
    ...body,
    id,
    restaurant_id: restaurantId,
    status: "pending",
    payment_status: "unpaid",
    paid_amount: 0,
    invoice_no: body.invoice_no || "PENDING",
    sync_status: "pending",
    created_at: body.created_at || now,
    updated_at: now,
  }
  for (const item of body.items || []) {
    const itemId = item.id || crypto.randomUUID()
    await mobileDbPut(restaurantId, "order_items", itemId, { ...item, id: itemId, order_id: id, restaurant_id: restaurantId, updated_at: now })
  }
  await mobileDbPut(restaurantId, "orders", id, order)
  await mobileDbPut(restaurantId, "order_snapshot", id, { ...order, items: body.items || [] })
  await mobileDbPut(restaurantId, "offline_order", id, { ...order, items: body.items || [] })
  await mobileDbQueuePut({
    entity: "orders",
    entity_id: id,
    restaurant_id: restaurantId,
    operation: "upsert",
    payload: { ...order, items: body.items || [] },
  })
  return jsonResponse({ success: true, order })
}

async function offlineKitchenOrders() {
  const restaurantId = rid()
  const [orders, snapshots, offline] = await Promise.all([
    listEntity(restaurantId, "orders"),
    listEntity(restaurantId, "order_snapshot"),
    listEntity(restaurantId, "offline_order"),
  ])
  const map = new Map()
  for (const row of [...offline, ...snapshots, ...orders]) if (row?.id) map.set(row.id, { ...map.get(row.id), ...row })
  const all = [...map.values()]
  for (const order of all) {
    if (!Array.isArray(order.items)) order.items = await listEntity(restaurantId, "order_items").then(rows => rows.filter(x => x.order_id === order.id))
  }
  return jsonResponse({ success: true, orders: all })
}

async function offlineKitchenStatus(body) {
  const restaurantId = rid()
  const order = await localOrder(body.order_id)
  if (!restaurantId || !order) return jsonResponse({ success: false, error: "Offline order not found." }, 404)
  const now = new Date().toISOString()
  const updated = { ...order, status: body.status, updated_at: now, sync_status: "pending" }
  await mobileDbPut(restaurantId, "orders", order.id, updated)
  await mobileDbPut(restaurantId, "order_snapshot", order.id, updated)
  await mobileDbPut(restaurantId, "offline_order", order.id, updated)
  await mobileDbQueuePut({ entity: "orders", entity_id: order.id, restaurant_id: restaurantId, operation: "upsert", payload: updated })
  return jsonResponse({ success: true, order: updated })
}

async function offlineBillingList() {
  const restaurantId = rid()
  const orders = await listEntity(restaurantId, "orders")
  const snapshots = await listEntity(restaurantId, "offline_order")
  const all = new Map()
  for (const row of [...snapshots, ...orders]) if (row?.id) all.set(row.id, { ...all.get(row.id), ...row })
  for (const order of all.values()) {
    if (!Array.isArray(order.items)) order.items = await listEntity(restaurantId, "order_items").then(rows => rows.filter(x => x.order_id === order.id))
  }
  return jsonResponse({ success: true, orders: [...all.values()] })
}

async function offlineBillingFinalize(body) {
  const restaurantId = rid()
  const order = await localOrder(body.order_id)
  if (!restaurantId || !order) return jsonResponse({ success: false, error: "Offline order not found." }, 404)
  const now = new Date().toISOString()
  const paidAmount = Number(body.paid_amount || 0)
  const total = Number(order.total_amount || 0)
  const paymentStatus = paidAmount >= total && total >= 0 ? "paid" : (paidAmount > 0 ? "partially_paid" : "unpaid")
  const invoiceNo = order.invoice_no && order.invoice_no !== "PENDING"
    ? order.invoice_no
    : `LOCAL-INV-${getMobileDeviceId().slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
  const updated = { ...order, invoice_no: invoiceNo, payment_status: paymentStatus, paid_amount: Math.max(Number(order.paid_amount || 0), paidAmount), payment_method: body.payment_method || order.payment_method || "cash", billed_at: order.billed_at || now, updated_at: now, sync_status: "pending" }
  await mobileDbPut(restaurantId, "orders", order.id, updated)
  await mobileDbPut(restaurantId, "order_snapshot", order.id, updated)
  await mobileDbPut(restaurantId, "offline_order", order.id, updated)
  if (paidAmount > 0) {
    const paymentId = crypto.randomUUID()
    await mobileDbPut(restaurantId, "payments", paymentId, { id: paymentId, restaurant_id: restaurantId, order_id: order.id, amount: paidAmount, payment_method: body.payment_method || "cash", status: "paid", paid_at: now, created_at: now, device_id: getMobileDeviceId() })
  }
  await mobileDbPut(restaurantId, "invoices", order.id, { id: order.id, restaurant_id: restaurantId, order_id: order.id, invoice_no: invoiceNo, total_amount: total, paid_amount: updated.paid_amount, payment_status: paymentStatus, created_at: now, updated_at: now })
  await mobileDbQueuePut({ entity: "billing_finalize", entity_id: order.id, restaurant_id: restaurantId, operation: "finalize", payload: { ...updated, paid_amount: paidAmount, payment_method: body.payment_method || "cash", device_id: getMobileDeviceId() } })
  return jsonResponse({ success: true, bill: { order_id: order.id, invoice_no: invoiceNo, subtotal: Number(order.subtotal || 0), discount: Number(order.discount_amount || 0), tax: Number(order.tax_amount || 0), delivery_charge: Number(order.delivery_charge || 0), total, paid_amount: updated.paid_amount, payment_received: paidAmount, payment_status: paymentStatus, payment_method: updated.payment_method, customer_id: order.customer_id || null, subtotal_amount: Number(order.subtotal || 0), discount_amount: Number(order.discount_amount || 0), tax_amount: Number(order.tax_amount || 0), total_amount: total } })
}

async function offlineDelivery(method, url, body) {
  const restaurantId = rid()
  if (method === "GET") {
    const deliveries = await listEntity(restaurantId, "restaurant_deliveries")
    return jsonResponse({ success: true, deliveries, riders: await listEntity(restaurantId, "riders"), zones: await listEntity(restaurantId, "delivery_zones") })
  }
  const action = body?.action
  const order = body?.order_id ? await localOrder(body.order_id) : null
  if (!restaurantId || !order) return jsonResponse({ success: false, error: "Offline order not found." }, 404)
  const now = new Date().toISOString()
  if (action === "create") {
    const deliveryId = crypto.randomUUID()
    const slipRows = await listEntity(restaurantId, "restaurant_deliveries")
    const maxSlip = slipRows.reduce((m, x) => Math.max(m, Number(String(x.slip_no || "").replace(/\D/g, "") || 0)), 0)
    const delivery = { id: deliveryId, order_id: order.id, restaurant_id: restaurantId, slip_no: `D-${String(maxSlip + 1).padStart(5, "0")}`, status: "pending", customer_name: body.customer_name || order.customer_name || "", phone: body.phone || order.customer_phone || "", address: body.address || order.delivery_address || "", zone: body.zone || null, delivery_charge: Number(body.delivery_charge || order.delivery_charge || 0), payment_method: body.payment_method || "cash", created_at: now, updated_at: now }
    await mobileDbPut(restaurantId, "restaurant_deliveries", delivery.id, delivery)
    await mobileDbQueuePut({ entity: "restaurant_deliveries", entity_id: delivery.id, restaurant_id: restaurantId, operation: "upsert", payload: delivery })
    return jsonResponse({ success: true, delivery })
  }
  if (action === "mark_done" || action === "done" || action === "complete") {
    const updated = { ...order, status: "done", updated_at: now, sync_status: "pending" }
    await mobileDbPut(restaurantId, "orders", order.id, updated)
    await mobileDbPut(restaurantId, "order_snapshot", order.id, updated)
    await mobileDbQueuePut({ entity: "orders", entity_id: order.id, restaurant_id: restaurantId, operation: "upsert", payload: updated })
    const deliveryRows = await listEntity(restaurantId, "restaurant_deliveries")
    const delivery = deliveryRows.find(x => x.order_id === order.id)
    if (delivery) await mobileDbPut(restaurantId, "restaurant_deliveries", delivery.id, { ...delivery, status: "done", delivered_at: now, updated_at: now })
    return jsonResponse({ success: true, delivery: delivery ? { ...delivery, status: "done", delivered_at: now } : null })
  }
  if (action === "settle") {
    const updated = { ...order, payment_status: "paid", paid_amount: Number(order.total_amount || 0), payment_method: body.payment_method || "cash", updated_at: now, sync_status: "pending" }
    await mobileDbPut(restaurantId, "orders", order.id, updated)
    await mobileDbPut(restaurantId, "order_snapshot", order.id, updated)
    await mobileDbQueuePut({ entity: "orders", entity_id: order.id, restaurant_id: restaurantId, operation: "upsert", payload: updated })
    return jsonResponse({ success: true, delivery: { order_id: order.id, status: "delivered", payment_status: "paid" }, settlement_result: "settled" })
  }
  return jsonResponse({ success: true, delivery: order })
}

export async function handleAndroidOfflineFetch(input, init = {}) {
  if (!isAndroid() || typeof navigator === "undefined" || navigator.onLine !== false) return null
  const request = input instanceof Request ? input : new Request(input, init)
  const url = new URL(request.url, window.location.origin)
  if (!url.pathname.startsWith("/api/")) return null
  let body = null
  if (request.method !== "GET" && request.method !== "HEAD") body = await request.clone().json().catch(() => ({}))
  if (url.pathname === "/api/pos/create" && request.method === "POST") return offlineCreateOrder(body)
  if (url.pathname === "/api/orders/create" && request.method === "POST") return offlineCreateOrder(body)
  if (url.pathname === "/api/kitchen/orders" && request.method === "GET") return offlineKitchenOrders()
  if (url.pathname === "/api/kitchen/order-status" && request.method === "POST") return offlineKitchenStatus(body)
  if (url.pathname === "/api/local/billing" && request.method === "GET") return offlineBillingList()
  if (url.pathname === "/api/billing/finalize" && request.method === "POST") return offlineBillingFinalize(body)
  if (url.pathname === "/api/delivery") return offlineDelivery(request.method, url, body)
  return null
}

export function installAndroidOfflineFetchBridge() {
  if (typeof window === "undefined" || !isAndroid() || window.__ANAIRA_OFFLINE_FETCH_BRIDGE__) return
  const original = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    try {
      const local = await handleAndroidOfflineFetch(input, init)
      if (local) return local
    } catch (error) {
      console.warn("Anaira offline API bridge:", error)
    }
    return original(input, init)
  }
  window.__ANAIRA_OFFLINE_FETCH_BRIDGE__ = true
}

export default function AndroidOfflineApiBridge() {
  useEffect(() => { installAndroidOfflineFetchBridge() }, [])
  return null
}
