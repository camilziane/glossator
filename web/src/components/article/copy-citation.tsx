"use client"

import { useRef } from "react"

import { CopyButton } from "@/components/content/copy-button"
import { citePlace, quoteWithCitation, type CiteCard, type CitePlace } from "@/lib/cite"
import { cn } from "@/lib/utils"

import { pageArgument, type PageRef } from "./page-refs"

/** What a copy control copies: the words with their citation, and Shift's LaTeX citation. */
export interface Citation {
  text: string
  latex: string
}

/** A page reference of the text as a place to cite: a page of the PDF, or of the SI ("SI p. 15"). */
function placeOf(ref: PageRef | null): CitePlace | null {
  if (!ref) return null
  const page = pageArgument(ref)
  return ref.doc ? { page, file: ref.doc } : { page }
}

/** The card, its PDF a manuscript when the files say so and the data does not say its version. */
function withVersion(card: CiteCard, manuscript: boolean): CiteCard {
  return card.version || !manuscript ? card : { ...card, version: "acceptedVersion" }
}

/**
 * A quote with its citation, by the app's one page rule (`citePlace`): `“the words” (Jumper et al.
 * 2021, p. 585)` at a journal page, "(…, PDF p. 5)" or "(…, manuscript p. 5)" otherwise, "(…, SI
 * p. 15)" in the supplementary information; Shift's LaTeX the same way.
 */
export function quoteCitation(
  quote: string,
  card: CiteCard,
  ref: PageRef | null,
  manuscript: boolean
): Citation {
  const of = withVersion(card, manuscript)
  const place = placeOf(ref)
  return { text: quoteWithCitation(quote, of, place), latex: citePlace(of, place).latex }
}

/**
 * A metric with its citation: `relative error: 4.2% (95% CI 3.1, 5.6), online (Novak & Ito 2024,
 * PDF p. 6)`.
 */
export function metricCitation(
  metric: string,
  value: string,
  condition: string,
  card: CiteCard,
  ref: PageRef | null,
  manuscript: boolean
): Citation {
  const of = withVersion(card, manuscript)
  const place = placeOf(ref)
  const what = [metric ? `${metric}: ${value}` : value, condition].filter(Boolean).join(", ")
  return {
    text: quoteWithCitation(what, of, place, { quote: false }),
    latex: citePlace(of, place).latex,
  }
}

/**
 * The copy control of a quote or a metric row: copies it with its citation; with Shift, the LaTeX
 * citation. Shown on hover or focus of what it belongs to (`group/copy`), always on touch screens;
 * the row's `y` key presses it (`copyFocused`).
 */
export function CopyCitation({
  citation,
  what,
  className,
}: {
  citation: Citation
  /** "the quote", "the metric". */
  what: string
  className?: string
}) {
  const shift = useRef(false)
  return (
    <CopyButton
      iconOnly
      size="icon-xs"
      variant="ghost"
      data-copy-control=""
      value={() => (shift.current ? citation.latex : citation.text)}
      onMouseDown={(e) => {
        shift.current = e.shiftKey
      }}
      onKeyDown={(e) => {
        shift.current = e.shiftKey
      }}
      title={`Copy ${what} with its citation (y) · Shift: ${citation.latex}`}
      accessibleLabel={(state) =>
        state === "copied"
          ? `Copied ${what}`
          : state === "failed"
            ? `Could not copy ${what}`
            : `Copy ${what} with its citation`
      }
      aria-keyshortcuts="y Shift+Y"
      className={cn(
        "text-muted-foreground opacity-0 transition-opacity group-focus-within/copy:opacity-100 group-hover/copy:opacity-100 hover:text-foreground focus-visible:opacity-100 data-[copy-state=copied]:text-success data-[copy-state=copied]:opacity-100 print:hidden [@media(hover:none)]:opacity-100",
        className
      )}
    />
  )
}

/**
 * The `y` key: copies the quote or metric the focus is in (Shift: its LaTeX citation). True when
 * there was one to copy.
 */
export function copyFocused(shiftKey: boolean): boolean {
  const holder = document.activeElement?.closest("[data-copyable]")
  const button = holder?.querySelector<HTMLButtonElement>("[data-copy-control]")
  if (!button) return false
  button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, shiftKey }))
  button.click()
  return true
}
