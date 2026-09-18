// Browser notification helper shared by Calling Device, Merchant Voice and
// Smart Notifications. Notifications work while the web app is open (even
// when the tab is in the background); native Android uses the existing bridge.
const recent = new Map()

export async function requestBrowserNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported"
  if (Notification.permission === "granted") return "granted"
  if (Notification.permission === "denied") return "denied"
  try { return await Notification.requestPermission() } catch { return Notification.permission }
}

export function showBrowserNotification(row, { enabled=true, prefix="Anaira" } = {}) {
  if (!enabled || typeof window === "undefined" || !row?.id) return false

  // Native Android bridge gets the notification first. The bridge is used by
  // the installed app, while the browser Notification API handles Chrome /
  // Edge / Firefox web sessions.
  try {
    if (window.Android && typeof window.Android.notify === "function") {
      window.Android.notify(
        String(row.title || "Restaurant notification"),
        String(row.message || "You have a new restaurant alert."),
        String(row.action_url || "")
      )
      return true
    }
  } catch {}

  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false

  const id = String(row.id)
  const now = Date.now()
  const last = recent.get(id) || 0
  if (now - last < 15000) return true
  recent.set(id, now)
  window.setTimeout(() => recent.delete(id), 20000)

  try {
    const n = new Notification(String(row.title || `${prefix} notification`), {
      body: String(row.message || "You have a new restaurant alert."),
      tag: `anaira-${id}`,
      requireInteraction: true,
      icon: "/icon-192.png",
    })
    n.onclick = () => {
      try { window.focus() } catch {}
      if (row.action_url) window.location.href = row.action_url
      n.close()
    }
    return true
  } catch { return false }
}
