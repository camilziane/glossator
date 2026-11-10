"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { loadLibrary } from "@/lib/data"
import { createChordReader, isGlobalKey, type GoTarget } from "@/lib/keyboard"
import { routes } from "@/lib/routes"

import { useCommandPalette } from "./command-palette-context"

/** The attribute a page puts on its filter field: `/` focuses it (else `/` opens the search). */
export const PAGE_FILTER_ATTR = "data-page-filter"

/** The page's filter field, when it shows one. */
export function pageFilter(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[${PAGE_FILTER_ATTR}]`)) {
    const shown = typeof el.checkVisibility === "function" ? el.checkVisibility() : true
    if (shown && !el.matches(":disabled")) return el
  }
  return null
}

/** Focus the page's filter and select what it holds; false when the page has none. */
export function focusPageFilter(): boolean {
  const el = pageFilter()
  if (!el) return false
  el.focus()
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select()
  return true
}

/**
 * The app's own keys: `g` chords to the pages (`g t` Today, `g i` Inbox, `g s` Search, `g 1`…`g 9`
 * the bibliographies in the top bar's order) and `/` (the page's filter, else the search palette).
 * `?` is the shortcuts dialog's (ShortcutsProvider), ⌘K the palette's (CommandPaletteProvider).
 *
 * Listened to before the page's own keys (capture), so `g s` is a chord even where `s` means
 * something on the page; a key the shell takes is `preventDefault`ed, which every page handler
 * checks (`isPlainKey`). Never while typing, over a dialog or a menu, with a modifier, or held down.
 */
export function GlobalKeys() {
  const router = useRouter()
  const palette = useCommandPalette()
  const [reader] = useState(createChordReader)

  useEffect(() => {
    const go = (target: GoTarget) => {
      if (target === "today") router.push(routes.overview())
      else if (target === "inbox") router.push(routes.inbox())
      else if (target === "search") router.push(routes.search())
      else
        void loadLibrary().then(
          (lib) => {
            const bib = lib.bibliographies[target.bib - 1]
            if (bib) router.push(routes.bib(bib.name))
          },
          () => {}
        )
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isGlobalKey(e)) {
        // Typing, a menu or a modified key between the two keys of a chord ends it.
        if (!["Shift", "CapsLock"].includes(e.key)) reader.cancel()
        return
      }
      const step = reader.read(e.key, performance.now())
      if (step.kind !== "none") {
        e.preventDefault()
        if (step.kind === "go") go(step.target)
        return
      }
      if (e.key === "/") {
        e.preventDefault()
        if (!focusPageFilter()) palette.setOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [router, palette, reader])

  return null
}
