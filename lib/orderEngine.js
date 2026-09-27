/**
 * Anaira Order Engine
 *
 * Canonical vocabulary for every order source and kitchen state. This is
 * additive: existing APIs and database columns remain unchanged. UI and
 * integrations can use these helpers so table, room, QR, takeaway and
 * delivery flows behave consistently.
 */

export const ORDER_SOURCES = Object.freeze({
  TABLE: "table",
  ROOM: "room",
  TAKEAWAY: "takeaway",
  DELIVERY: "delivery",
  WEBSITE: "website"
})

export const KITCHEN_STATUSES = Object.freeze({
  PENDING: "pending",
  PREPARING: "preparing",
  DONE: "done",
  CANCELLED: "cancelled"
})

export const TERMINAL_STATUSES = new Set([
  "done", "completed", "complete", "cancelled", "canceled",
  "void", "voided", "refunded"
])

export function isTerminalOrderStatus(status) {
  return TERMINAL_STATUSES.has(String(status || "").trim().toLowerCase())
}

export function sourceNeedsLocation(sourceType) {
  return sourceType === ORDER_SOURCES.TABLE || sourceType === ORDER_SOURCES.ROOM
}

export function sourceLabel({ sourceType, source, customerName }) {
  if (sourceType === ORDER_SOURCES.TABLE) return `Table ${source?.table_number ?? "—"}`
  if (sourceType === ORDER_SOURCES.ROOM) return `Room ${source?.room_number ?? "—"}`
  if (sourceType === ORDER_SOURCES.DELIVERY) return `Delivery - ${customerName || "Customer"}`
  if (sourceType === ORDER_SOURCES.TAKEAWAY) return "Takeaway"
  return "Online Order"
}
