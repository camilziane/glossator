import Link from "next/link"
import { Fragment, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { resolveHref, type Inline, type Inlines } from "@/lib/data"
import { routes } from "@/lib/routes"
import type { TypesetLang } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { PageMark, pageRefOf } from "./page-mark"
import { Typeset } from "./typeset"

export type InlineContext = "text" | "cell"

interface Options {
  context: InlineContext
  lang?: TypesetLang | null
  acronyms: boolean
}

/**
 * Inline parts (sitedata.inline) as React elements: text, links (web, library files, anchors), links
 * to other articles, emphasis, strong, muted values, TODOs, badges and sub-lines. Never HTML strings.
 *
 * Text is typeset for the page (`<Typeset>`: quotes, dashes, no-break spaces, small-caps acronyms in
 * running text), never a link whose text is an address, a DOI or a file name. A link whose text is a
 * page reference ("p. 5", "SI p. 15", the "p. 4" of "Table 1 (p. 4)") is a rubric page mark.
 *
 * `context="cell"` draws a sub-line on its own line (a table's Article cell: cite, then title, then
 * place) and marks no acronyms (table cells are in the sans); in running text it stays inline.
 */
export function InlineContent({
  parts,
  context = "text",
  lang,
  acronyms = context === "text",
}: {
  parts: Inlines
  context?: InlineContext
  /** The text's language (`guessLang`): "fr" adds the French spacing rules. */
  lang?: TypesetLang | null
  /** Small-caps acronyms (serif text): on in running text, off in cells. */
  acronyms?: boolean
}): ReactNode {
  const options: Options = { context, lang, acronyms }
  return parts.map((part, i) => <Fragment key={i}>{renderPart(part, options)}</Fragment>)
}

const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const

/** A link's text that is an identifier, not words: never typeset. */
const IDENTIFIER =
  /^(?:https?:|www\.|doi:|10\.\d{4,}\/|PMID|PMC\d|arXiv:)|^\S*\/\S*$|^[\w.-]+\.[A-Za-z0-9]{2,5}$/iu

function renderPart(part: Inline, o: Options): ReactNode {
  const words = (text: string) => <Typeset text={text} lang={o.lang} acronyms={o.acronyms} />
  if (typeof part === "string") return words(part)
  switch (part.t) {
    case "a": {
      const link = resolveHref(part.href)
      if (!link) return words(part.text)
      if (link.kind === "anchor") {
        return (
          <a href={link.href} className="link">
            {words(part.text)}
          </a>
        )
      }
      const ref = pageRefOf(part.text)
      if (ref) {
        return (
          <>
            {ref.before ? words(ref.before) : null}
            <PageMark page={ref.page} doc={ref.doc} href={link.href}>
              {ref.text}
            </PageMark>
            {ref.after ? words(ref.after) : null}
          </>
        )
      }
      return (
        <a href={link.href} className="link" {...NEW_TAB}>
          {IDENTIFIER.test(part.text.trim()) ? part.text : words(part.text)}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )
    }
    case "art":
      return (
        <Link href={routes.article(part.bib, part.key)} className="link">
          {words(part.text)}
        </Link>
      )
    case "em":
      return <em>{words(part.text)}</em>
    case "b":
      return <strong className="font-semibold">{words(part.text)}</strong>
    case "muted":
      return part.text ? (
        <span className="text-muted-foreground italic">{words(part.text)}</span>
      ) : null
    case "todo":
      return <span className="font-medium text-danger not-italic">{part.text}</span>
    case "badge":
      return (
        <Badge variant={part.text === "draft" ? "warning" : "secondary"} className="mx-0.5">
          {part.text}
        </Badge>
      )
    case "sub":
      return part.text ? (
        <span
          className={cn(
            "text-muted-foreground",
            o.context === "cell" ? "mt-0.5 block text-small" : "text-[0.9em]"
          )}
        >
          {o.context === "text" ? " " : null}
          {words(part.text)}
        </span>
      ) : null
  }
}
