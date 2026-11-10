"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useLayoutEffect, useRef, type RefObject } from "react"

import { entryKey } from "@/lib/routes"

import { claimEntryFocus, focusEntryTarget, mayTakeFocus, pageHeading } from "./page-entry"

export type EntryFocusTarget = RefObject<HTMLElement | null> | (() => HTMLElement | null)

/**
 * Focus on page entry: when the reader arrives on the page (a link, Back, a `g` chord; not a filter
 * or the inbox's next paper), the focus moves to the page's main object, without scrolling, so its
 * keys work at once. Without this hook the shell focuses the page's h1.
 *
 *   const rowRef = useRef<HTMLTableRowElement>(null)
 *   useEntryFocus(rowRef, { ready: rows.length > 0 })
 *
 * `target`: a ref, or a function that finds the element (the current row of a list). `ready`: false
 * while the object is not drawn yet (deferred rows); the page keeps its claim meanwhile, and focuses
 * once it is. No element when ready: the h1. The focus never moves if the reader has already put it
 * somewhere (typed in a field while the page loaded).
 */
export function useEntryFocus(
  target: EntryFocusTarget,
  { ready = true }: { ready?: boolean } = {}
) {
  const key = entryKey(usePathname(), useSearchParams())
  const done = useRef<string | null>(null)

  // A layout effect: the claim is made in the commit that draws the page, before the shell looks.
  useLayoutEffect(() => {
    claimEntryFocus(key)
  }, [key])

  useLayoutEffect(() => {
    if (!ready || done.current === key) return
    done.current = key
    if (!mayTakeFocus()) return
    const el = typeof target === "function" ? target() : target.current
    const to = el?.isConnected ? el : pageHeading()
    if (to) focusEntryTarget(to)
  })
}
