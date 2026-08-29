const KEY = "anaira.device.id.v11"

function randomUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `device-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getMobileDeviceId() {
  if (typeof window === "undefined") return "server"
  try {
    const existing = window.localStorage.getItem(KEY)
    if (existing) return existing
    const id = randomUuid()
    window.localStorage.setItem(KEY, id)
    return id
  } catch {
    return randomUuid()
  }
}

export function getMobileDeviceName() {
  if (typeof window === "undefined") return "server"
  const ua = navigator.userAgent || ""
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua)
  return mobile ? `Android • ${getMobileDeviceId().slice(0, 8)}` : `Web • ${getMobileDeviceId().slice(0, 8)}`
}
