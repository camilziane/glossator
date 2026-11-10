"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useLayoutEffect, useState } from "react"

import { entryKey, fromHere, listKey, parseFrom } from "@/lib/routes"

import { arrivalFor, previousEntryHref, requestReturn } from "./page-entry"

/**
 * List memory: a list page remembers its current row and its scroll position per URL (this tab's
 * sessionStorage), and gets them back when the reader returns (Back, a reload, Esc from an article).
 *
 *   const memory = useListMemory()
 *   const [current, setCurrent] = useState(() => memory.restored?.row ?? firstRow)
 *   useEffect(() => memory.remember(current), [current])
 *   useEntryFocus(() => rowElement(current))
 *
 * The scroll position is followed by the hook and restored on a return (once the page is long
 * enough again; never against the reader's own scrolling). A fresh visit starts at the top.
 */
export interface ListMemory {
  /** What the list held when the reader left it, on a return; null on a fresh visit. */
  restored: Remembered | null
  /** The current row changed (its id, as the list keys its rows). */
  remember: (row: string | null) => void
}

export interface Remembered {
  row: string | null
  scrollY: number
}

const PREFIX = "list-memory:"
/** How long a restore may wait for the list to grow back to its height. */
const RESTORE_MS = 1500

function storageKey(key: string): string {
  return PREFIX + key
}

/** Read what a list remembered (null when nothing, or storage is off). */
export function readListMemory(key: string): Remembered | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(key))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Remembered>
    return {
      row: typeof value.row === "string" ? value.row : null,
      scrollY: typeof value.scrollY === "number" && value.scrollY > 0 ? value.scrollY : 0,
    }
  } catch {
    return null
  }
}

/** Remember a list's row and/or scroll position (merged with what it remembered). */
export function writeListMemory(key: string, change: Partial<Remembered>): void {
  try {
    const was = readListMemory(key) ?? { row: null, scrollY: 0 }
    window.sessionStorage.setItem(storageKey(key), JSON.stringify({ ...was, ...change }))
  } catch {
    // Storage off (a private window's quota): the list simply starts at the top.
  }
}

/**
 * What the list remembered, when the reader is coming back to it (else null). `href` is the URL the
 * router renders (during a push the window's location is still the previous page's).
 */
function readOnArrival(memoryKey: string, href: string): Remembered | null {
  if (typeof window === "undefined") return null
  return arrivalFor(href) === "return" ? readListMemory(memoryKey) : null
}

export function useListMemory(key?: string): ListMemory {
  const pathname = usePathname()
  const params = useSearchParams()
  const qs = params.toString()
  const href = qs ? `${pathname}?${qs}` : pathname
  const memoryKey = key ?? listKey(href)
  // Read once per arrival on this page (a later change of its filters is not a return); another
  // page in the same component (the hub of another bibliography) is a new arrival.
  const page = entryKey(pathname, params)
  const [arrival, setArrival] = useState(() => ({ page, restored: readOnArrival(memoryKey, href) }))
  if (arrival.page !== page) setArrival({ page, restored: readOnArrival(memoryKey, href) })
  const restored = arrival.page === page ? arrival.restored : null

  // Follow the scroll position while the list is on screen.
  useEffect(() => {
    let frame = 0
    let saveTimer: number | undefined
    let y = window.scrollY
    const save = () => writeListMemory(memoryKey, { scrollY: Math.round(y) })
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        y = window.scrollY
        window.clearTimeout(saveTimer)
        saveTimer = window.setTimeout(save, 150)
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pagehide", save)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pagehide", save)
      window.cancelAnimationFrame(frame)
      window.clearTimeout(saveTimer)
      // The position last seen on this list: by now the next page may have scrolled the window.
      save()
    }
  }, [memoryKey])

  // On a return, scroll back once the list is drawn tall enough; the reader's own move stops it.
  useLayoutEffect(() => {
    const target = restored?.scrollY ?? 0
    if (target <= 0) return
    let frame = 0
    const started = performance.now()
    const stop = () => {
      window.cancelAnimationFrame(frame)
      for (const type of ["wheel", "touchstart", "keydown", "pointerdown"] as const)
        window.removeEventListener(type, stop)
    }
    const attempt = () => {
      window.scrollTo({ top: target, behavior: "instant" })
      const reached = Math.abs(window.scrollY - target) < 2
      if (reached || performance.now() - started > RESTORE_MS) return stop()
      frame = window.requestAnimationFrame(attempt)
    }
    for (const type of ["wheel", "touchstart", "keydown", "pointerdown"] as const)
      window.addEventListener(type, stop, { passive: true, once: true })
    attempt()
    return stop
    // Once per arrival: `restored` is read once.
  }, [restored])

  return {
    restored,
    remember: (row) => writeListMemory(memoryKey, { row }),
  }
}

// ---------------------------------------------------------------------------- list contexts

/**
 * The `from` value of the list on screen, for the links it makes to articles:
 * `routes.article(bib, key, undefined, { from: useFromHere() })`. Null off a list.
 */
export function useFromHere(): string | null {
  return fromHere(usePathname(), useSearchParams())
}

const ORDER_PREFIX = "list-order:"

/**
 * A list says in what order it shows its articles (`<bib>/<key>` refs), so an article opened from
 * it pages within it (`readListOrder(from)`). Call it with what is on screen, when it changes.
 */
export function rememberListOrder(from: string, refs: readonly string[]): void {
  try {
    window.sessionStorage.setItem(ORDER_PREFIX + listKey(from), JSON.stringify(refs))
  } catch {
    // Storage off: the article pages within its bibliography instead.
  }
}

/** The order a list showed (null when it said none: a shared link, another tab). */
export function readListOrder(from: string): string[] | null {
  try {
    const raw = window.sessionStorage.getItem(ORDER_PREFIX + listKey(from))
    const value: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(value) && value.every((x) => typeof x === "string") ? value : null
  } catch {
    return null
  }
}

/**
 * Back to the list an article was opened from (its Esc), with `row` (the article now shown, after
 * paging) as the list's current row: Back when the list is the previous page (its scroll comes
 * back too), else a push that the list treats as a return. Returns false when `from` names no list.
 */
export function useReturnToList(): (from: string | null | undefined, row?: string) => boolean {
  const router = useRouter()
  return (from, row) => {
    const ctx = parseFrom(from)
    if (!ctx) return false
    if (row !== undefined) writeListMemory(listKey(ctx.href), { row })
    const previous = previousEntryHref()
    if (previous !== null && listKey(previous) === listKey(ctx.href)) {
      window.history.back()
      return true
    }
    requestReturn(ctx.href)
    router.push(ctx.href)
    return true
  }
}
