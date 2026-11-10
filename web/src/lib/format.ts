/**
 * Formatting shared by every page (English UI, the reader's time zone). Dates are written day first,
 * with the month abbreviated: "23 Aug 2023", "07:45, 10 Nov 2026", "1 Nov" (one style everywhere).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
const numberFormat = new Intl.NumberFormat("en")

function parse(iso: string): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A calendar day's parts: a plain date is read as written (no time zone shift), a time as local. */
function dayParts(iso: string): { y: number; m: number; d: number } | null {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (plain) {
    const [y, m, d] = [Number(plain[1]), Number(plain[2]), Number(plain[3])]
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { y, m, d } : null
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso)) return null
  const date = parse(iso)
  return date ? { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() } : null
}

/**
 * "23 Aug 2023"; a partial date reads "Aug 2023" or "2023"; anything unreadable is returned as
 * given.
 */
export function formatDate(iso: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(iso)
  if (month) {
    const m = Number(month[2])
    return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${month[1]}` : iso
  }
  const p = dayParts(iso)
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : iso
}

/** "1 Nov" this year, "1 Nov 2025" another year (lists, meta lines). */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const p = dayParts(iso)
  if (!p) return formatDate(iso)
  return p.y === now.getFullYear()
    ? `${p.d} ${MONTHS[p.m - 1]}`
    : `${p.d} ${MONTHS[p.m - 1]} ${p.y}`
}

/** "today", "yesterday", else null: for a day ("found today", the inbox's day groups). */
export function relativeDay(iso: string, now: Date = new Date()): "today" | "yesterday" | null {
  const p = dayParts(iso)
  if (!p) return null
  const day = Date.UTC(p.y, p.m - 1, p.d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((today - day) / 86_400_000)
  return diff === 0 ? "today" : diff === 1 ? "yesterday" : null
}

/** "07:45, 10 Nov 2026" (24-hour clock, the reader's time zone). */
export function formatDateTime(iso: string): string {
  const d = parse(iso)
  if (!d) return iso
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "3 hours ago", "yesterday", "in 2 days". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = parse(iso)
  if (!d) return iso
  const seconds = (d.getTime() - now.getTime()) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit)
  }
  return "just now"
}

/** "1 article", "48 articles" (pass the plural when it is not noun + s). */
export function formatCount(n: number, noun: string, plural = `${noun}s`): string {
  return `${numberFormat.format(n)} ${n === 1 ? noun : plural}`
}

export function formatNumber(n: number): string {
  return numberFormat.format(n)
}

/**
 * A venue as a meta line shows it: without the database's parenthesis or the server's tagline.
 * "arXiv (Cornell University)" -> "arXiv"; "bioRxiv : the preprint server for biology" ->
 * "bioRxiv"; "Annals of Invented Ecology (Springfield, Ill. : 1990)" -> "Annals of Invented Ecology".
 */
export function shortVenue(venue: string): string {
  let v = venue.trim()
  // A trailing parenthesis (where the database says the venue lives, or its founding year).
  for (let previous = ""; previous !== v;) {
    previous = v
    v = v.replace(/\s*\([^()]*\)\s*$/u, "").trim() || previous
  }
  // A tagline after " : " or ": the …".
  const tagline = /^(.+?)\s+:\s+.+$/u.exec(v) ?? /^(.+?):\s+(?:the|a|an)\s.+$/iu.exec(v)
  if (tagline?.[1]) v = tagline[1].trim()
  return v
}
