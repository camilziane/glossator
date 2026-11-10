/**
 * The top bar's logic, free of React: what each link is called, which one is current, and whether
 * the bibliographies fit as links or fold into the "Library" menu.
 */
import type { Bibliography } from "@/lib/data"
import { normalizePath, PARAMS } from "@/lib/routes"

/** The width (px) below which the bibliographies always fold into the Library menu. */
export const FOLD_BELOW_PX = 1180
/** More bibliographies than this always fold. */
export const MAX_INLINE_BIBS = 5

/**
 * What the bibliographies may take in the bar at FOLD_BELOW_PX: the room between Today · Inbox and
 * the search group, in px, and the cost of one link beside its name (its count and the gaps).
 */
const INLINE_ROOM_PX = 520
const LINK_COST_PX = 52
const CHAR_PX = 7.3

/** A bibliography's name in the bar: its short name, else its title. */
export function bibLabel(bib: Pick<Bibliography, "short" | "title" | "name">): string {
  return bib.short || bib.title || bib.name
}

/** Whether these names fit as links at FOLD_BELOW_PX (beyond it, they always do). */
export function bibsFitInline(labels: readonly string[]): boolean {
  if (labels.length === 0 || labels.length > MAX_INLINE_BIBS) return false
  const chars = labels.reduce((n, label) => n + label.length, 0)
  return chars * CHAR_PX + labels.length * LINK_COST_PX <= INLINE_ROOM_PX
}

export type NavPlace =
  | { kind: "today" }
  | { kind: "inbox" }
  | { kind: "search" }
  /** A hub (`page`) or one of its articles. */
  | { kind: "bib"; bib: string; page: boolean }
  | { kind: "other" }

/** Where the reader is, as the bar marks it. */
export function navPlace(pathname: string, params: { get(name: string): string | null }): NavPlace {
  switch (normalizePath(pathname)) {
    case "/":
      return { kind: "today" }
    case "/inbox":
      return { kind: "inbox" }
    case "/search":
      return { kind: "search" }
    case "/bib":
    case "/article": {
      const bib = params.get(PARAMS.bib)
      return bib
        ? { kind: "bib", bib, page: normalizePath(pathname) === "/bib" }
        : { kind: "other" }
    }
    default:
      return { kind: "other" }
  }
}
