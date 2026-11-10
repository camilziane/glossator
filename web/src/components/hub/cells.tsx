"use client"

import Link from "next/link"
import { Fragment, type ReactNode } from "react"

import { CiteLine } from "@/components/content/cite"
import { InlineContent } from "@/components/content/inline"
import { DraftBadge, NoticeBadges } from "@/components/content/notice-badge"
import { Typeset } from "@/components/content/typeset"
import { Badge } from "@/components/ui/badge"
import { type Inlines } from "@/lib/data"
import { guessLang } from "@/lib/lang"
import { routes } from "@/lib/routes"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { useHubLinks, useLines } from "./hub-context"
import { splitCI, type ArticleRow } from "./model"
import { type RowLines } from "./use-row-lines"

/** A clamped block keeps whole lines (it is cut at a word, where its text wraps). */
const CLAMP: Record<RowLines, string> = {
  "1": "max-h-[1lh] overflow-hidden",
  "2": "max-h-[2lh] overflow-hidden",
  full: "",
}

/**
 * Only a block that cuts its text (measured: `data-cut`, clamp-measure.ts) fades its last
 * line's last 3 em; a static mask, never an animation per cell.
 */
const FADE =
  "data-[cut]:[mask-image:linear-gradient(#000,#000),linear-gradient(to_left,transparent,#000_3em)] data-[cut]:[mask-position:top,bottom] data-[cut]:[mask-repeat:no-repeat] data-[cut]:[mask-size:100%_calc(100%_-_1lh),100%_1lh]"

/**
 * In print a row keeps the table's lines (Full: at most 4, `--print-lines` on the table), cut
 * without a fade; a whole block (a title, key metrics) prints whole.
 */
const PRINT_CLAMP =
  "print:max-h-[calc(var(--print-lines,4)*1lh)] print:overflow-hidden print:[mask-image:none]!"
const PRINT_WHOLE = "print:max-h-none print:overflow-visible print:[mask-image:none]!"

/**
 * A cell's text block, clamped to the table's lines. `whole`: the row's name and its key metrics,
 * never clamped but on one-line rows. A cut block (`data-clamp`, `data-cut`) fades and offers
 * its whole text in a popover after 400 ms of hover or focus; `data-cell` makes it a stop of the
 * arrow keys across a row (← →), so the keyboard reaches that popover too.
 */
export function Clamp({
  children,
  className,
  focusable = true,
  whole = false,
}: {
  children: ReactNode
  className?: string
  focusable?: boolean
  whole?: boolean
}) {
  const lines = useLines()
  const clamped = lines !== "full" && !(whole && lines === "2")
  const block = (
    <div
      data-clamp={clamped ? "" : undefined}
      className={cn(
        "min-w-0 break-words",
        clamped && CLAMP[lines],
        clamped && FADE,
        whole ? PRINT_WHOLE : PRINT_CLAMP,
        className
      )}
    >
      {children}
    </div>
  )
  // The focus outline sits on a wrapper: the fade's mask would clip it.
  return focusable ? (
    <div data-cell="" tabIndex={-1} className="-mx-1 rounded-[2px] px-1">
      {block}
    </div>
  ) : (
    block
  )
}

/** A title in a row: the serif's item size, lining figures; underlined in rubric on hover. */
const TITLE =
  "font-serif text-item font-semibold text-pretty text-foreground [font-variant-numeric:lining-nums_proportional-nums] decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] decoration-1 underline-offset-[0.18em] group-hover/title:underline"

/** A citation under (or beside) a title: the serif's small size, old-style figures, muted. */
const CITE =
  "font-serif text-small text-muted-foreground [font-variant-numeric:oldstyle-nums_proportional-nums]"

/** Draws a hub cell's inline parts; links to articles carry the list they come from (`from`). */
export function HubInline({ parts }: { parts: Inlines }) {
  const { from } = useHubLinks()
  return parts.map((part, i) => {
    if (typeof part !== "string" && part.t === "art") {
      // A reference to an article: its citation in the serif (surnames in small caps), a faint
      // rubric underline that firms on hover (a column of them must not shout).
      const card = {
        key: part.key,
        cite: part.text,
        title: "",
        authors: "",
        year: null,
        venue: "",
        doi: "",
      }
      return (
        <Link
          key={i}
          href={routes.article(part.bib, part.key, undefined, { from })}
          className="font-serif text-small [font-variant-numeric:oldstyle-nums_proportional-nums] underline decoration-[color-mix(in_oklab,var(--rubric)_30%,transparent)] decoration-1 underline-offset-[0.2em] transition-[text-decoration-color] duration-150 hover:decoration-rubric"
          tabIndex={-1}
        >
          <CiteLine card={card} separator=", " />
        </Link>
      )
    }
    return (
      <Fragment key={i}>
        <InlineContent parts={[part]} context="cell" />
      </Fragment>
    )
  })
}

/**
 * The Article cell: the title in the serif, the citation under it (surnames in small caps, the venue
 * in italic) with its notices and the data's marks, both the row's link; where the work was done
 * when the row shows everything.
 */
export function ArticleCell({ row }: { row: ArticleRow }) {
  const lines = useLines()
  const { bib, from } = useHubLinks()
  const href = row.key ? routes.article(bib, row.key, undefined, { from }) : null
  const title = <Typeset text={row.title} lang={guessLang(row.title)} acronyms />
  const card = row.article ?? {
    key: row.key ?? row.id,
    cite: row.cite,
    title: row.title,
    authors: "",
    year: row.year,
    venue: "",
    doi: "",
  }
  const draft = row.status === "draft"
  const badges = row.badges.filter((b) => !(draft && b === "draft"))
  const oneLine = lines === "1"
  const marks =
    row.notices.length > 0 || draft || badges.length > 0 ? (
      <>
        <span aria-hidden>{" · "}</span>
        <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
          {row.notices.length > 0 ? <NoticeBadges notices={row.notices} /> : null}
          {draft ? <DraftBadge /> : null}
          {badges.map((b) => (
            <Badge key={b} variant={b === "draft" ? "warning" : "secondary"}>
              {b}
            </Badge>
          ))}
        </span>
      </>
    ) : null
  const titleBlock = (
    <Clamp focusable={false} whole className={cn(TITLE, oneLine && "shrink")}>
      {title}
    </Clamp>
  )
  // One-line rows: the title, then the citation (who and when) on the same line; else the
  // citation (with its venue) under the whole title.
  const name = oneLine ? (
    <span className="flex min-w-0 items-baseline gap-x-2.5">
      {titleBlock}
      <span className={cn(CITE, "shrink-0 whitespace-nowrap")}>
        <CiteLine card={card} venue={false} />
        {marks}
      </span>
    </span>
  ) : (
    <>
      {titleBlock}
      <span className={cn(CITE, "mt-0.5 block")}>
        <CiteLine card={card} />
        {marks}
      </span>
    </>
  )
  return (
    <div className="min-w-0">
      {/* The title and its citation are the row's link (out of the tab order: the row is the stop). */}
      {href ? (
        <Link href={href} tabIndex={-1} data-row-title className="group/title block">
          {name}
        </Link>
      ) : (
        name
      )}
      {lines === "full" && row.place ? (
        <p className="mt-0.5 font-sans text-small text-muted-foreground">
          <Typeset text={row.place} />
        </p>
      ) : null}
    </div>
  )
}

/** A text cell: the data's parts, clamped. `ids`: an id (`isIdTable`), broken only after hyphens. */
export function TextCell({ parts, ids = false }: { parts: Inlines; ids?: boolean }) {
  return <Clamp>{ids ? <IdText parts={parts} /> : <HubInline parts={parts} />}</Clamp>
}

/** A figure in a value ("30 %", "0.564 ± 0.109", "1,200", "4–10"), to set in bold. */
export const FIGURE =
  /((?<![\p{L}\p{N}_.-])(?:[−+±~≈<>≤≥]\s?)?\d(?:[\d.,]*\d)?(?:\s?[–-]\u2060?\s?\d(?:[\d.,]*\d)?)?(?:\s?(?:%|‰|×))?(?![\p{L}\d]))/u

/** A text's figures in bold, never inside a parenthesis ("(Plot 1)", "(S12)"). */
function boldFigures(text: string, key: string): ReactNode[] {
  return text.split(/(\([^()]*\))/u).flatMap((chunk, c) =>
    c % 2 === 1
      ? [chunk]
      : chunk.split(FIGURE).map((piece, j) =>
          j % 2 === 1 ? (
            <strong key={`${key}-${c}-${j}`} className="font-semibold">
              {piece}
            </strong>
          ) : (
            piece
          )
        )
  )
}

/**
 * A value with only its figures in bold: never its confidence interval (muted) nor what a
 * parenthesis says; a value without any figure is bold whole.
 */
export function FigureText({ text }: { text: string }) {
  const { value, ci } = splitCI(typeset(text))
  const main = FIGURE.test(value) ? (
    boldFigures(value, "v")
  ) : (
    <strong className="font-semibold">{value}</strong>
  )
  return (
    <>
      {main}
      {ci ? <span className="text-muted-foreground">{ci}</span> : null}
    </>
  )
}

/**
 * A metric or a result, as the data writes it: a value in bold, then what it measures. Here only
 * the value's figures are bold (FigureText), and what follows a value, up to the next ";", is its
 * label: in muted ink after an en space. `everywhere`: the figures of plain text too (a value cell).
 */
export function MetricText({
  parts,
  everywhere = false,
}: {
  parts: Inlines
  everywhere?: boolean
}) {
  let afterValue = false
  return parts.map((part, i) => {
    if (typeof part !== "string") {
      afterValue = part.t === "b"
      if (part.t === "b") return <FigureText key={i} text={part.text} />
      return <HubInline key={i} parts={[part]} />
    }
    // The space between a value and its label (the data writes it apart): an en space follows.
    if (afterValue && part.trim() === "") return null
    if (afterValue) {
      afterValue = false
      const cut = part.indexOf(";")
      const label = (cut < 0 ? part : part.slice(0, cut)).trim()
      const rest = cut < 0 ? "" : part.slice(cut)
      if (label) {
        return (
          <Fragment key={i}>
            {"\u2002"}
            <span className="text-muted-foreground">
              <Typeset text={label} />
            </span>
            {rest ? <Typeset text={rest} /> : null}
          </Fragment>
        )
      }
    }
    return everywhere ? (
      <Fragment key={i}>{boldFigures(typeset(part), String(i))}</Fragment>
    ) : (
      <Typeset key={i} text={part} />
    )
  })
}

/** The key metrics (or results) cell: never clamped but on one-line rows. */
export function MetricCell({ parts }: { parts: Inlines }) {
  return (
    <Clamp whole>
      <MetricText parts={parts} />
    </Clamp>
  )
}

/** "S12-B4-a": a line break may come only after a hyphen (never inside a part of the id). */
export function IdText({ parts }: { parts: Inlines }) {
  return parts.map((part, i) => {
    const text = typeof part === "string" ? part : part.text
    if (typeof part !== "string" && part.t !== "b" && part.t !== "muted") {
      return <HubInline key={i} parts={[part]} />
    }
    const pieces = text.split(/(?<=-)/)
    const node = (
      <span className="[overflow-wrap:normal] break-keep">
        {pieces.map((piece, j) => (
          <Fragment key={j}>
            {j > 0 ? <wbr /> : null}
            {piece}
          </Fragment>
        ))}
      </span>
    )
    return typeof part === "string" ? (
      <Fragment key={i}>{node}</Fragment>
    ) : part.t === "b" ? (
      <strong key={i} className="font-semibold">
        {node}
      </strong>
    ) : (
      <span key={i} className="text-muted-foreground italic">
        {node}
      </span>
    )
  })
}

/**
 * The first cell of a second table (a sensor type, a kind): when it names one of the
 * bibliography's tags, a link to the Articles that carry it.
 */
export function EntryCell({ parts }: { parts: Inlines }) {
  const { tags, tagHref } = useHubLinks()
  const text = parts
    .map((p) => (typeof p === "string" ? p : p.text))
    .join("")
    .trim()
  if (!tags.has(text)) return <TextCell parts={parts} />
  return (
    <Clamp>
      <Link
        href={tagHref(text)}
        tabIndex={-1}
        className="font-semibold link"
        aria-label={`${text}: the articles tagged so`}
      >
        <Typeset text={text} />
      </Link>
    </Clamp>
  )
}

export function YearCell({ year }: { year: number | null }) {
  return year === null ? (
    <span className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">no year</span>
    </span>
  ) : (
    <span className="num">{year}</span>
  )
}

/** The tags as words with middle dots, muted: no chips. */
export function TagsCell({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return <span className="text-muted-foreground italic">none</span>
  return (
    <Clamp>
      <span className="text-muted-foreground">
        {tags.map((tag, i) => (
          <Fragment key={tag}>
            {i > 0 ? <span aria-hidden> · </span> : null}
            {i > 0 ? <span className="sr-only">, </span> : null}
            <span className="whitespace-nowrap">{tag}</span>
          </Fragment>
        ))}
      </span>
    </Clamp>
  )
}
