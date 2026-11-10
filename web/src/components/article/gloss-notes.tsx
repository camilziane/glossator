"use client"

import { plainText, type Block, type Inlines, type QuoteBlock, type SourceBlock } from "@/lib/data"
import { cn } from "@/lib/utils"

import { useArticleContext } from "./article-context"
import { CopyCitation, quoteCitation } from "./copy-citation"
import { InlineWithPages } from "./inline-pages"
import { firstPageRef } from "./page-refs"

/** How a note is drawn: in the margin, inline after its text (narrow screens), or as the text. */
export type NoteLayout = "margin" | "inline" | "text"

/**
 * The notes of a stretch of text: in the margin beside it from 1024 px, after it on narrow screens
 * (each a note: a hairline on its left). An `<aside>` in its section: read after the text it glosses.
 */
export function GlossNotes({
  notes,
  pdf,
  layout = "margin",
  className,
}: {
  notes: readonly Block[]
  pdf: string | null
  layout?: NoteLayout
  className?: string
}) {
  if (notes.length === 0) return null
  return (
    <aside className={cn("min-w-0 space-y-4", layout === "margin" && "lg:space-y-5", className)}>
      {notes.map((note, i) =>
        note.t === "quote" ? (
          <QuoteNote key={i} block={note} pdf={pdf} layout={layout} />
        ) : note.t === "source" ? (
          <SourceNote key={i} block={note} pdf={pdf} layout={layout} />
        ) : null
      )}
    </aside>
  )
}

/** A note's frame: in the margin plain; inline (narrow screens, folded detail) a hairline on its left. */
export function noteFrame(layout: NoteLayout): string {
  // In the margin, an invisible 2 px rule outside the text: a lit note shows it in rubric.
  return layout === "margin"
    ? "border-l border-border pl-3 lg:-ml-3 lg:border-l-2 lg:border-transparent lg:pl-2.5 print:ml-0 print:border-0 print:pl-0"
    : layout === "inline"
      ? "border-l border-border pl-3"
      : ""
}

/** "p. 4, Methods 2.1" → "p. 4 · Methods 2.1": the page mark first, then where in the paper. */
export function markFirst(cite: Inlines): Inlines {
  const [first, ...rest] = cite
  if (typeof first !== "string") return cite
  return [
    first.replace(/^(\s*(?:PDF\s+)?pp?\.\s?\d{1,4}(?:\s?[-–]\s?\d{1,4})?)\s*,\s*/u, "$1 · "),
    ...rest,
  ]
}

/**
 * A quote of the paper: the serif at 14/20, roman, muted ink, its opening mark hanging; then its page
 * mark and where it is ("p. 5 · Results"), and a control that copies it with its citation.
 */
export function QuoteNote({
  block,
  pdf,
  layout = "margin",
}: {
  block: QuoteBlock
  pdf: string | null
  layout?: NoteLayout
}) {
  const { card, manuscript } = useArticleContext()
  const words = plainText(block.c)
  const ref = firstPageRef(plainText(block.cite))
  const text = layout === "text"
  return (
    <figure
      data-gloss-note=""
      data-copyable=""
      className={cn(
        "group/copy gloss-note relative",
        noteFrame(layout),
        text ? "max-w-measure" : "text-muted-foreground"
      )}
    >
      <blockquote
        className={cn("pl-[0.42em] -indent-[0.42em]", text ? "reading" : "gloss text-inherit")}
      >
        <p>
          “<InlineWithPages parts={block.c} pdf={pdf} />”
        </p>
      </blockquote>
      <figcaption
        className={cn(
          "flex items-baseline gap-1 font-sans text-small text-muted-foreground",
          text ? "mt-1.5" : "mt-1"
        )}
      >
        <span className="min-w-0">
          {block.cite.length > 0 ? (
            <InlineWithPages parts={markFirst(block.cite)} pdf={pdf} acronyms={false} />
          ) : null}
        </span>
        {card ? (
          <CopyCitation
            citation={quoteCitation(words, card, ref, manuscript)}
            what="the quote"
            className="-my-1 shrink-0 self-center"
          />
        ) : null}
      </figcaption>
    </figure>
  )
}

/** "Source: p. 4, Fig. 2" → "p. 4, Fig. 2": in the margin, a note of pages says it is a source. */
export function withoutSourceWord(parts: Inlines): Inlines {
  const [first, ...rest] = parts
  if (typeof first !== "string" || !/^\s*Sources?:\s*/iu.test(first)) return parts
  const stripped = first.replace(/^\s*Sources?:\s*/iu, "")
  return stripped ? [stripped, ...rest] : rest
}

/** Where a section's content comes from ("Source: pp. 4–10, Results"): a note of pages. */
export function SourceNote({
  block,
  pdf,
  layout = "margin",
}: {
  block: SourceBlock
  pdf: string | null
  layout?: NoteLayout
}) {
  const parts = withoutSourceWord(block.c)
  return (
    <p
      data-gloss-note=""
      className={cn(
        "gloss-note font-sans text-small text-pretty text-muted-foreground",
        noteFrame(layout)
      )}
    >
      {parts !== block.c ? <span className="sr-only">Source: </span> : null}
      <InlineWithPages parts={parts} pdf={pdf} acronyms={false} />
    </p>
  )
}
