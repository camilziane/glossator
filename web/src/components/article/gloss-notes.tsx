"use client"

import { ChevronDownIcon } from "lucide-react"

import { IdentityIcon } from "@/components/content/identity"
import { plainText, type Inlines, type QuoteBlock, type SourceBlock } from "@/lib/data"
import { APP } from "@/lib/identity"
import { cn } from "@/lib/utils"

import { useArticleContext } from "./article-context"
import { CopyCitation, quoteCitation } from "./copy-citation"
import { InlineWithPages } from "./inline-pages"
import { firstPageRef } from "./page-refs"

/**
 * How a note is drawn: after the text it glosses (`inline`: a quote folds under its page, a source
 * is a small line), or as the text itself (`text`: a section made of quotes).
 */
export type NoteLayout = "inline" | "text"

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
 * A quote of the paper: its words in the serif, its opening mark hanging; then its page mark and
 * where it is ("p. 5 · Results"), and a control that copies it with its citation. After the text it
 * glosses it folds: "Quote · p. 5" opens it (open in print). As the text, it reads in full.
 */
export function QuoteNote({
  block,
  pdf,
  layout = "inline",
}: {
  block: QuoteBlock
  pdf: string | null
  layout?: NoteLayout
}) {
  const { card, manuscript } = useArticleContext()
  const words = plainText(block.c)
  const ref = firstPageRef(plainText(block.cite))
  const text = layout === "text"
  const quote = (
    <figure
      data-gloss-note=""
      data-copyable=""
      className={cn(
        "group/copy gloss-note relative",
        text ? "max-w-measure" : "mt-1.5 max-w-measure border-l border-border pl-3"
      )}
    >
      <blockquote
        className={cn(
          "pl-[0.42em] -indent-[0.42em]",
          text ? "reading" : "gloss text-muted-foreground"
        )}
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
  if (text) return quote
  return (
    <details data-print-open="" className="group/quote">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-[4px] font-sans text-small text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <IdentityIcon identity={APP.quote} className="size-3.5" />
        <span>
          Quote
          {ref ? <span className="num"> · {ref.text}</span> : null}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 transition-transform duration-150 group-open/quote:rotate-180"
        />
      </summary>
      {quote}
    </details>
  )
}

/** "Source: p. 4, Fig. 2" → "p. 4, Fig. 2": the icon says it is a source. */
export function withoutSourceWord(parts: Inlines): Inlines {
  const [first, ...rest] = parts
  if (typeof first !== "string" || !/^\s*Sources?:\s*/iu.test(first)) return parts
  const stripped = first.replace(/^\s*Sources?:\s*/iu, "")
  return stripped ? [stripped, ...rest] : rest
}

/**
 * Where a section's content comes from ("Source: pp. 4–10, Results"): a small muted line after
 * the text, the paper's icon before it.
 */
export function SourceNote({
  block,
  pdf,
  layout = "inline",
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
        "gloss-note flex items-baseline gap-1.5 font-sans text-small text-pretty text-muted-foreground",
        layout === "text" && "max-w-measure"
      )}
    >
      <IdentityIcon identity={APP.paper} className="size-3.5 translate-y-0.5 self-start" />
      <span className="min-w-0">
        <span className="sr-only">Source: </span>
        <InlineWithPages parts={parts} pdf={pdf} acronyms={false} />
      </span>
    </p>
  )
}
