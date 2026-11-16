import { intlLocale } from "./i18n"

export const pad2 = (n: number) => String(n).padStart(2, "0")

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseIsoDate(s: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "")
  if (!m) return undefined
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Resolve "today", "-30d", "+7d", "+1y" or "YYYY-MM-DD" to an ISO date. */
export function resolveDateBound(bound: string | undefined, now: Date = new Date()): string | undefined {
  if (!bound) return undefined
  const b = bound.trim().toLowerCase()
  if (b === "today") return toIsoDate(now)
  const rel = /^([+-])(\d+)([dwmy])$/.exec(b)
  if (rel) {
    const n = Number(rel[2]) * (rel[1] === "-" ? -1 : 1)
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (rel[3] === "d") d.setDate(d.getDate() + n)
    if (rel[3] === "w") d.setDate(d.getDate() + 7 * n)
    if (rel[3] === "m") d.setMonth(d.getMonth() + n)
    if (rel[3] === "y") d.setFullYear(d.getFullYear() + n)
    return toIsoDate(d)
  }
  return parseIsoDate(b) ? b.slice(0, 10) : undefined
}

export function parseTime(s: unknown): { h: number; m: number } | undefined {
  const m = /^(\d{1,2}):(\d{2})/.exec(typeof s === "string" ? s : "")
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return undefined
  return { h, m: min }
}

export function formatTime24(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`
}

/** Local ISO date-time with UTC offset, e.g. 2026-11-16T08:30:00-05:00. */
export function toLocalIsoWithOffset(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? "+" : "-"
  const abs = Math.abs(off)
  return `${toIsoDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

/** Split a stored datetime value back into its date and time parts. */
export function splitDateTime(v: unknown): { date?: string; time?: string } {
  if (typeof v !== "string") return {}
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(v)
  return m ? { date: m[1], time: m[2] } : {}
}

/** Build a datetime value from local date + time strings. */
export function combineDateTime(date: string, time: string): string | undefined {
  const d = parseIsoDate(date)
  const t = parseTime(time)
  if (!d || !t) return undefined
  d.setHours(t.h, t.m, 0, 0)
  return toLocalIsoWithOffset(d)
}

export function formatDateForDisplay(iso: string, language: string): string {
  const d = parseIsoDate(iso)
  if (!d) return iso
  try {
    return new Intl.DateTimeFormat(intlLocale(language), { dateStyle: "medium" }).format(d)
  } catch {
    return iso
  }
}

export function formatTimeForDisplay(value: string, format: "12h" | "24h", language: string): string {
  const t = parseTime(value)
  if (!t) return value
  const d = new Date(2000, 0, 1, t.h, t.m)
  try {
    return new Intl.DateTimeFormat(intlLocale(language), {
      hour: "numeric",
      minute: "2-digit",
      hour12: format === "12h",
    }).format(d)
  } catch {
    return value
  }
}

export function formatDuration(minutes: number, hShort: string, mShort: string): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h} ${hShort} ${m} ${mShort}`
  if (h) return `${h} ${hShort}`
  return `${m} ${mShort}`
}

export function formatRelativeWhen(ts: number, language: string): string {
  try {
    return new Intl.DateTimeFormat(intlLocale(language), { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}
