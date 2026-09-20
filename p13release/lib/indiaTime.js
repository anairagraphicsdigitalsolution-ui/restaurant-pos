// Central India Standard Time (IST) formatting.
// Timestamps are still stored as UTC/ISO in Supabase; only presentation/business-day
// calculations are localized here. Override with NEXT_PUBLIC_APP_TIMEZONE if needed.
export const APP_TIMEZONE =
  process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"

const DATE_LOCALE = "en-IN"

function asDate(value) {
  if (value instanceof Date) return value
  if (value === null || value === undefined || value === "") return null

  const raw = String(value).trim()
  const timezoneLessTimestamp =
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw) &&
    !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)

  const d = timezoneLessTimestamp
    ? new Date(`${raw.replace(" ", "T")}+05:30`)
    : new Date(value)

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


export function indiaDateKeyDaysAgo(days = 0, value = new Date()) {
  const baseKey = indiaDateKey(value)
  if (!baseKey) return ""
  const base = new Date(`${baseKey}T12:00:00+05:30`)
  if (Number.isNaN(base.getTime())) return ""
  base.setUTCDate(base.getUTCDate() - Number(days || 0))
  return indiaDateKey(base)
}

export function indiaDateFromKey(key, hour = 12) {
  if (!key) return null
  const d = new Date(`${key}T${String(hour).padStart(2, "0")}:00:00+05:30`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function indiaStartOfMonthIso(value = new Date()) {
  const key = indiaDateKey(value)
  if (!key) return null
  const [year, month] = key.split("-").map(Number)
  if (!year || !month) return null
  return new Date(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`
  ).toISOString()
}
