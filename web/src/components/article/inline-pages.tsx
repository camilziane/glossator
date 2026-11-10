import { Fragment, type ReactNode } from "react"

import { CiteLine } from "@/components/content/cite"
import { InlineContent } from "@/components/content/inline"
import { PageMark } from "@/components/content/page-mark"
import { Typeset } from "@/components/content/typeset"
import { referenceParts, type CiteCard } from "@/lib/cite"
import { resolveHref, type Inline, type Inlines } from "@/lib/data"
import { typeset, type TypesetLang } from "@/lib/typeset"

import { ArticleLink } from "./article-link"
import { pageHref, splitPageRefs } from "./page-refs"

interface Options {
  pdf: string | null
  lang?: TypesetLang | null
  acronyms: boolean
}

/**
 * A text typeset for the page, its cited pages ("p. 5", "pp. 13-14") as page marks: a page of the
 * paper opens the PDF there, a page of the supplementary information is marked as such.
 */
function TextWithPages({ text, o }: { text: string; o: Options }): ReactNode {
  return splitPageRefs(text).map((piece, j) =>
    typeof piece === "string" ? (
      <Typeset key={j} text={piece} lang={o.lang} acronyms={o.acronyms} />
    ) : (
      <PageMark
        key={j}
        page={piece.page}
        doc={piece.doc}
        href={!piece.doc && o.pdf ? pageHref(o.pdf, piece.page) : null}
      >
        {typeset(piece.text)}
      </PageMark>
    )
  )
}

function PartWithPages({ part, o }: { part: Inline; o: Options }): ReactNode {
  if (typeof part === "string") return <TextWithPages text={part} o={o} />
  // Marks that hold running text carry page citations too ("confirmed (p. 9: …)").
  switch (part.t) {
    case "em":
      return (
        <em>
          <TextWithPages text={part.text} o={o} />
        </em>
      )
    case "b":
      return (
        <strong className="font-semibold">
          <TextWithPages text={part.text} o={o} />
        </strong>
      )
    case "muted":
      return part.text ? (
        <span className="text-muted-foreground italic">
          <TextWithPages text={part.text} o={o} />
        </span>
      ) : null
    case "art":
      return (
        <ArticleLink bib={part.bib} articleKey={part.key} text={part.text}>
          <Typeset text={part.text} lang={o.lang} acronyms={o.acronyms} />
        </ArticleLink>
      )
    case "a": {
      // A link whose words are a cite ("Jumper et al. 2021, Nature", a DOI's) is drawn as one.
      const cite = citeCard(part.text)
      const link = cite ? resolveHref(part.href) : null
      if (cite && link && link.kind === "external") {
        return (
          <a href={link.href} target="_blank" rel="noopener noreferrer" className="link">
            <CiteLine card={cite} venue={/\d,\s/u.test(part.text)} />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )
      }
      return (
        <InlineContent
          parts={[part]}
          lang={o.lang}
          acronyms={o.acronyms}
          context={o.acronyms ? "text" : "cell"}
        />
      )
    }
    default:
      // Links (a link whose text is a page is a page mark there too), TODOs, badges, sub-lines.
      return (
        <InlineContent
          parts={[part]}
          lang={o.lang}
          acronyms={o.acronyms}
          context={o.acronyms ? "text" : "cell"}
        />
      )
  }
}

/**
 * A card for words that are a cite ("Card et al. 2024, N Engl J Med", "Novak & Ito 2024"), so the
 * cite line draws them (surnames in small caps, the venue in italic); null for other words.
 */
export function citeCard(text: string): CiteCard | null {
  const t = text.trim()
  if (t.length > 90 || !/^\p{Lu}/u.test(t)) return null
  const card: CiteCard = {
    key: "",
    cite: t,
    title: "",
    authors: "",
    year: null,
    venue: "",
    doi: "",
  }
  const { names, year } = referenceParts(card)
  return names.length > 0 && /^(?:1[5-9]|20)\d{2}[a-z]?$/u.test(year) ? card : null
}

/**
 * An article's inline parts: typeset text, page references as rubric page marks (signes de renvoi:
 * `data-page` pairs them with the margin's notes), links to other articles of the library with a
 * card of what they found. `acronyms` (small caps) in serif text only.
 */
export function InlineWithPages({
  parts,
  pdf,
  lang,
  acronyms = true,
}: {
  parts: Inlines
  pdf: string | null
  lang?: TypesetLang | null
  acronyms?: boolean
}): ReactNode {
  const o: Options = { pdf, lang, acronyms }
  return parts.map((part, i) => (
    <Fragment key={i}>
      <PartWithPages part={part} o={o} />
    </Fragment>
  ))
}
