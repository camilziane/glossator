"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect } from "react"

import {
  currentEntry,
  entryFocusClaimed,
  focusEntryTarget,
  mayTakeFocus,
  noteEntryHref,
  pageHeading,
  startEntry,
} from "@/hooks/page-entry"
import { entryKey } from "@/lib/routes"

/** How long the shell waits for a page's h1 (the library loading on a slow disk). */
const HEADING_WAIT_MS = 10_000

/**
 * Starts a page entry at each arrival, and gives the page's h1 the focus (without scrolling) unless
 * the page focuses its own main object (`useEntryFocus`). The h1 may come later than the route (the
 * library loading behind a skeleton): it is awaited.
 */
export function EntryFocus() {
  const pathname = usePathname()
  const params = useSearchParams()
  const key = entryKey(pathname, params)
  const qs = params.toString()

  useEffect(() => {
    const entry = startEntry(key)
    let timer: number | undefined
    let observer: MutationObserver | null = null
    const stop = () => {
      observer?.disconnect()
      observer = null
      window.clearTimeout(timer)
    }
    const settle = () => {
      if (entryFocusClaimed(entry)) return stop()
      const h1 = pageHeading()
      if (!h1) return
      stop()
      // After the page's own effects: a page that claims the focus in a later commit wins.
      timer = window.setTimeout(() => {
        if (!entryFocusClaimed(entry) && mayTakeFocus()) focusEntryTarget(h1)
      }, 0)
    }
    settle()
    const main = document.getElementById("main")
    if (main && !entryFocusClaimed(entry) && !pageHeading()) {
      observer = new MutationObserver(settle)
      observer.observe(main, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-busy"],
      })
      timer = window.setTimeout(stop, HEADING_WAIT_MS)
    }
    return stop
  }, [key])

  // The same page, its URL changed (a filter, a query, the current row): the entry follows it, after
  // the router has written it to the history (this effect runs after that).
  useEffect(() => {
    if (currentEntry()?.key === key) noteEntryHref()
  }, [key, pathname, qs])

  return null
}
