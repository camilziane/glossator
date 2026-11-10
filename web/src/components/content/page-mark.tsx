import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** A page reference found in a text: "p. 5", "pp. 4–10", "SI p. 15". */
export interface PageRef {
  /** The text before the reference ("Table 1 (" in "Table 1 (p. 4)"). */
  before: string
  /** The reference as written ("p. 4"). */
  text: string
  /** The text after it (")"). */
  after: string
  /** The first page it names. */
  page: number
  /** The document when it is not the paper: "SI" (supplementary information). */
  doc?: string
}

/** "p. 5", "pp. 4-10", "SI p. 15", "Suppl. pp. 2–3": a page reference, maybe inside a longer text. */
const PAGE_REF =
  /(?:\b(SI|Suppl\.?|Supplementary)[\s\u00A0]+)?\b(pp?\.)[\s\u00A0]?(\d{1,4})(?:[\s\u00A0]?[-–][\s\u00A0]?(\d{1,4}))?(?![\d.]*\d)/u

/** The page reference in a link's text, if it has one (else null). */
export function pageRefOf(text: string): PageRef | null {
  const m = PAGE_REF.exec(text)
  if (!m) return null
  const page = Number(m[3])
  if (!Number.isInteger(page) || page <= 0) return null
  // "SI", "Suppl." and "Supplementary" all name the supplementary information.
  const doc = m[1] ? "SI" : undefined
  return {
    before: text.slice(0, m.index),
    text: m[0],
    after: text.slice(m.index + m[0].length),
    page,
    ...(doc ? { doc } : {}),
  }
}

/**
 * The key that pairs a page mark in the text with the gloss notes of the same page (`data-page`):
 * "5" for the paper's page 5, "SI 15" for page 15 of the supplementary information.
 */
export function pageKey(ref: Pick<PageRef, "page" | "doc">): string {
  return ref.doc ? `${ref.doc} ${ref.page}` : String(ref.page)
}

/**
 * A page mark (signe de renvoi): the page reference in rubric, no underline; a link to the PDF at
 * that page when there is one. Its face and figures are its context's (old-style in the serif's
 * prose, lining in a sans table cell). `data-page` pairs it with the gloss notes of the same page
 * (the article lights both on hover and focus). On touch screens its target is 12 px taller and 6 px
 * wider each way, the lines unmoved (globals.css).
 */
export function PageMark({
  page,
  doc,
  href,
  children,
  className,
}: {
  page: number
  doc?: string
  /** The PDF at that page (`pdfPageHref`), or none: the mark is then plain text. */
  href?: string | null
  /** The reference as written ("p. 5"). */
  children: ReactNode
  className?: string
}) {
  const classes = cn(
    "page-mark font-medium whitespace-nowrap text-rubric no-underline",
    href &&
      "decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] underline-offset-[0.18em] hover:underline",
    className
  )
  const key = pageKey({ page, doc })
  if (!href) {
    return (
      <span className={classes} data-page={key}>
        {children}
      </span>
    )
  }
  const where = doc ? `page ${page} of the supplementary information` : `PDF page ${page}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={classes}
      data-page={key}
      title={`Open the ${doc ? "file" : "PDF"} at page ${page}`}
    >
      {children}
      <span className="sr-only"> ({where}, new tab)</span>
    </a>
  )
}
