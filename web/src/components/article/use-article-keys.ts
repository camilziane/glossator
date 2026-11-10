"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import type { ShortcutSection } from "@/components/shell/shortcuts"
import { useReturnToList } from "@/hooks/use-list-memory"
import { isPlainKey, isTypingTarget, overlayOpen } from "@/lib/keyboard"
import { parseFrom, routes } from "@/lib/routes"

import { copyFocused } from "./copy-citation"
import type { ListPosition } from "./list-position"
import { goToSection } from "./use-scroll-spy"

/** The article's keys, listed in the shortcuts dialog (`?`). */
export const ARTICLE_SHORTCUTS: ShortcutSection = {
  title: "An article",
  shortcuts: [
    { keys: [["["], ["]"]], label: "Previous / next article of the list you came from" },
    { keys: [["p"]], label: "Open the PDF" },
    { keys: [["c"]], label: "Cite: the key, \\cite, BibTeX, the reference" },
    { keys: [["m"]], label: "Go to the key metrics, the whole table open" },
    { keys: [["f"]], label: "Go to the figures" },
    { keys: [["y"]], label: "Copy the quote or metric in focus with its citation" },
    { keys: [["Shift", "Y"]], label: "Copy its LaTeX citation, \\cite[p.~5]{key}" },
    { keys: [["Esc"]], label: "Back to the list you came from, on this article" },
  ],
}

export interface ArticleKeyTargets {
  /** `<bib>/<key>` of the article shown. */
  ref: string
  place: ListPosition
  from: string
  pdf: string | null
  /** The key metrics' section id, the figures' (null: none on this page). */
  metrics: string | null
  figures: string | null
  openCite: () => void
  /** Open the whole key metrics table (its disclosure). */
  openMetrics: () => void
}

/**
 * The article's keys: `[` `]` page within the list the reader came from (in place: Back and Esc still
 * lead to the list), `p` the PDF, `c` the Cite menu, `m` the key metrics, `f` the figures, `y` (Shift)
 * copies the quote or metric in focus, Esc returns to the list the reader came from (`from`) with
 * this article as its row. They
 * only move the reader or copy: not while typing, over a dialog or a menu, or with a modifier.
 */
export function useArticleKeys(targets: ArticleKeyTargets): void {
  const router = useRouter()
  const returnToList = useReturnToList()
  const latest = useRef({ targets, returnToList })
  useEffect(() => {
    latest.current = { targets, returnToList }
  })
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(e.target) || overlayOpen()) return
      const t = latest.current.targets
      const step = (entry: ListPosition["previous"]) => {
        if (!entry) return
        router.replace(
          routes.article(entry.bib.name, entry.article.key, undefined, { from: t.from || null })
        )
      }
      switch (e.key) {
        case "[":
        case "]": {
          if (e.repeat) return
          const entry = e.key === "[" ? t.place.previous : t.place.next
          if (!entry) return
          e.preventDefault()
          step(entry)
          return
        }
        case "p":
          if (!t.pdf || e.repeat) return
          e.preventDefault()
          window.open(t.pdf, "_blank", "noopener,noreferrer")
          return
        case "c":
          if (e.repeat) return
          e.preventDefault()
          t.openCite()
          return
        case "m":
        case "f": {
          const id = e.key === "m" ? t.metrics : t.figures
          if (!id) return
          e.preventDefault()
          if (e.key === "m") t.openMetrics()
          goToSection(id)
          return
        }
        case "y":
        case "Y":
          if (e.repeat) return
          if (copyFocused(e.shiftKey)) e.preventDefault()
          return
        case "Escape":
          // Transient things (a menu, a card, the lightbox) close first and take the key; the page
          // returns only to a list the reader came from (a link from elsewhere has none).
          if (e.shiftKey || !parseFrom(t.from)) return
          e.preventDefault()
          latest.current.returnToList(t.from, t.ref)
          return
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [router])
}
