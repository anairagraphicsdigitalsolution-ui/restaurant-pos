// Central India Standard Time (IST) formatting.
// Timestamps are still stored as UTC/ISO in Supabase; only presentation/business-day
// calculations are localized here. Override with NEXT_PUBLIC_APP_TIMEZONE if needed.
export const APP_TIMEZONE =
  process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"

const DATE_LOCALE = "en-IN"

function asDate(value) {
  if (value instanceof Date) return value
  if (value === null || value === undefined || value === "") return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatIndiaDateTime(value, options = {}) {
  const d = asDate(value)
  if (!d) return ""
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(d)
}

export function formatIndiaDate(value, options = {}) {
  const d = asDate(value)
  if (!d) return ""
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  }).format(d)
}

export function formatIndiaTime(value, options = {}) {
  const d = asDate(value)
  if (!d) return ""
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(d)
}

export function indiaDateKey(value = new Date()) {
  const d = asDate(value)
  if (!d) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const get = (type) => parts.find((p) => p.type === type)?.value || ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

export function indiaStartOfDayIso(value = new Date()) {
  const key = indiaDateKey(value)
  return key ? new Date(`${key}T00:00:00+05:30`).toISOString() : null
}

export function indiaEndOfDayIso(value = new Date()) {
  const key = indiaDateKey(value)
  return key ? new Date(`${key}T23:59:59.999+05:30`).toISOString() : null
}
