"use client"

import { ChevronDownIcon, EllipsisIcon } from "lucide-react"
import Link from "next/link"
import { Fragment, type Ref } from "react"

import { CiteLine } from "@/components/content/cite"
import { CiteMenu } from "@/components/content/cite-menu"
import { useCopy } from "@/components/content/copy-button"
import { InlineContent } from "@/components/content/inline"
import { DraftBadge } from "@/components/content/notice-badge"
import { Typeset } from "@/components/content/typeset"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { bibtex, formatReference, latexCite } from "@/lib/cite"
import {
  resolveHref,
  type Article,
  type ArticleEntry,
  type ArticleFile,
  type ArticleView,
  type Inlines,
} from "@/lib/data"
import { formatDate, formatNumber } from "@/lib/format"
import { routes, type ListKind } from "@/lib/routes"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { ArticleNotices } from "./article-notices"
import type { ListPosition } from "./list-position"

// ---------------------------------------------------------------------------- the kicker

function bibName(entry: ArticleEntry): string {
  return entry.bib.short || entry.bib.title || entry.bib.name
}

/** Where the folio counts when the list is not the bibliography's own. */
const LIST_WORDS: Record<ListKind, string> = {
  bib: "",
  search: "in the search",
  inbox: "in the inbox",
  today: "on Today",
}

/** "ML methods · 8 of 49", with the previous and next articles of the list as ‹ ›. */
export function Kicker({
  entry,
  place,
  from,
}: {
  entry: ArticleEntry
  place: ListPosition
  from: string
}) {
  const { position, count } = place
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 label">
      <span>{bibName(entry)}</span>
      {count > 1 && position > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          <span>
            <span className="sr-only">Article </span>
            {formatNumber(position)} of {formatNumber(count)}
            {place.list ? (
              place.list.kind === "bib" ? (
                <span className="sr-only"> in the list you came from</span>
              ) : (
                <span> {LIST_WORDS[place.list.kind]}</span>
              )
            ) : null}
          </span>
          <Pager place={place} from={from} className="ml-1 print:hidden" />
        </>
      ) : null}
    </p>
  )
}

/** ‹ and ›: the previous and next articles of the list (`[` and `]`), paging in place. */
export function Pager({
  place,
  from,
  className,
}: {
  place: ListPosition
  from: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 font-sans [@media(pointer:coarse)]:gap-5",
        className
      )}
    >
      <Step entry={place.previous} from={from} direction="previous" />
      <Step entry={place.next} from={from} direction="next" />
    </span>
  )
}

function Step({
  entry,
  from,
  direction,
}: {
  entry: ArticleEntry | null
  from: string
  direction: "previous" | "next"
}) {
  const glyph = direction === "previous" ? "‹" : "›"
  const word = direction === "previous" ? "Previous article" : "Next article"
  const key = direction === "previous" ? "[" : "]"
  const box =
    // On a touch screen, a 44 px target around the glyph (the line does not grow).
    "relative inline-flex h-6 min-w-6 items-center justify-center rounded-[4px] text-read leading-none [font-variant-caps:normal] [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-2.5 [@media(pointer:coarse)]:after:content-['']"
  if (!entry) {
    return (
      <span aria-hidden="true" className={cn(box, "text-muted-foreground/40")}>
        {glyph}
      </span>
    )
  }
  return (
    <Link
      href={routes.article(entry.bib.name, entry.article.key, undefined, { from: from || null })}
      replace
      scroll
      title={`${word}: ${entry.article.cite} (${key})`}
      aria-label={`${word}: ${entry.article.cite}`}
      aria-keyshortcuts={key}
      className={cn(box, "text-foreground hover:bg-muted")}
    >
      {glyph}
    </Link>
  )
}

// ---------------------------------------------------------------------------- the lines

/** The cite line: surnames in small caps, the year, the venue in italic, then the lab's place. */
function CiteKicker({ article, view }: { article: Article; view: ArticleView | undefined }) {
  // The view's kicker is "<cite> · <place>": the cite is drawn from the card, the place follows.
  const kicker = view?.kicker ?? []
  const rest = typeof kicker[0] === "string" && kicker[0] === article.cite ? kicker.slice(2) : []
  // A place "not reported" says nothing here.
  const place = rest.every((p) => typeof p !== "string" && p.t === "muted") ? [] : rest
  return (
    <p className="font-serif text-note text-muted-foreground">
      <CiteLine card={article} />
      {place.length > 0 ? (
        <>
          <span aria-hidden="true"> · </span>
          <InlineContent parts={place} acronyms={false} />
        </>
      ) : null}
    </p>
  )
}

function isEllipsis(name: string): boolean {
  return name === "…" || name === "..."
}

/**
 * The authors as a line of the sans: "Lindqvist, Herrera, … Abernathy · 12 authors", the first and the last
 * in ink, each name kept whole.
 */
export function AuthorsLine({ authors }: { authors: string }) {
  const count = /\s*\((\d+)\s+authors?\)\s*$/u.exec(authors)
  const names = authors
    .slice(0, count ? count.index : undefined)
    .split(/\s*,\s*/u)
    .map((n) => n.trim())
    .filter(Boolean)
  if (names.length === 0) return null
  const real = names.filter((n) => !isEllipsis(n))
  const firstLast = real.length > 2 ? new Set([real[0], real[real.length - 1]]) : new Set<string>()
  return (
    <p className="mt-3 font-sans text-ui text-pretty text-muted-foreground">
      {names.map((name, i) => {
        if (isEllipsis(name)) {
          return (
            <Fragment key={i}>
              {" "}
              <span aria-hidden="true">…</span>
              <span className="sr-only">and others,</span>
            </Fragment>
          )
        }
        return (
          <Fragment key={i}>
            {i === 0 ? "" : isEllipsis(names[i - 1] ?? "") ? " " : ", "}
            <span className={cn("whitespace-nowrap", firstLast.has(name) && "text-foreground")}>
              {typeset(name)}
            </span>
          </Fragment>
        )
      })}
      {count ? (
        <span className="whitespace-nowrap"> · {formatNumber(Number(count[1]))} authors</span>
      ) : null}
    </p>
  )
}

const ISO_DATE = /\b\d{4}-\d{2}(?:-\d{2})?\b/gu

/**
 * The venue line: the journal in the serif's italic, volume, pages, the date ("23 Aug 2023"), the
 * DOI and the identifiers (each kept on one line).
 */
function VenueLine({ meta }: { meta: Inlines }) {
  return (
    <p className="mt-1 font-sans text-ui text-pretty text-muted-foreground">
      {meta.map((part, i) => {
        if (typeof part === "string") {
          return <Typeset key={i} text={part.replace(ISO_DATE, (d) => formatDate(d))} />
        }
        if (part.t === "em") {
          return (
            <i key={i} className="font-serif text-note text-foreground">
              {typeset(part.text)}
            </i>
          )
        }
        if (part.t === "a") {
          const link = resolveHref(part.href)
          return link ? (
            <a
              key={i}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap link"
            >
              {part.text}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span key={i}>{part.text}</span>
          )
        }
        return <InlineContent key={i} parts={[part]} acronyms={false} />
      })}
    </p>
  )
}

// ---------------------------------------------------------------------------- files

/** A menu's trigger among text links: words and a chevron, the wash on hover (no underline). */
const TEXT_TRIGGER = "-mx-1.5 h-auto gap-1 px-1.5 py-0.5 text-ui font-medium"

function isRecord(file: ArticleFile): boolean {
  return /(^|\/)record\.json$/.test(file.href)
}

/** "PDF · accepted manuscript" → "accepted manuscript". */
function pdfQualifier(label: string): string {
  return label.replace(/^PDF\s*(?:·|-|:)?\s*/u, "").trim()
}

function extensionOf(href: string): string {
  return /\.([a-z0-9]+)$/i.exec(href)?.[1]?.toLowerCase() ?? ""
}

/** The article's own PDF: a text link, its kind (published version, manuscript) after it. */
function PdfLink({ file }: { file: ArticleFile }) {
  const link = resolveHref(file.href)
  const missing = /\bto fetch\s*$/i.test(file.label)
  if (!link || missing) {
    return (
      <span className="text-muted-foreground" title="Not on this computer yet">
        {file.label}
      </span>
    )
  }
  const kind = pdfQualifier(file.label)
  return (
    <span className="whitespace-nowrap">
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-keyshortcuts="p"
        className="font-medium link"
      >
        PDF
        {kind ? <span className="sr-only"> · {kind}</span> : null}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {kind ? (
        <span aria-hidden="true" className="ml-1.5 text-muted-foreground">
          {kind}
        </span>
      ) : null}
    </span>
  )
}

/** The supplementary files: one is a link; more open a menu of them. */
function SupplementaryLinks({ files }: { files: readonly ArticleFile[] }) {
  if (files.length === 0) return null
  if (files.length === 1) {
    const file = files[0]!
    const link = resolveHref(file.href)
    if (!link) return null
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className="link">
        {typeset(file.label)}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={TEXT_TRIGGER}>
          Supplementary{" "}
          <span className="font-normal text-muted-foreground num">{files.length}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto max-w-[min(28rem,90vw)] min-w-64">
        <SupplementaryItems files={files} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SupplementaryItems({ files }: { files: readonly ArticleFile[] }) {
  return (
    <>
      <DropdownMenuLabel className="label">Supplementary files</DropdownMenuLabel>
      {files.map((file, i) => {
        const link = resolveHref(file.href)
        if (!link) return null
        return (
          <DropdownMenuItem key={i} asChild>
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              <span className="min-w-0 flex-1 truncate">{typeset(file.label)}</span>
              <span className="mono text-small text-muted-foreground">
                {extensionOf(link.href)}
              </span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

/**
 * The files and the Cite menu. From 768 px, a line of text links: PDF, the supplementary files, Cite
 * (`c`). On a phone, one full-width PDF button and a "⋯" menu with the rest (the files, the ways to
 * cite).
 */
function FilesLine({
  article,
  files,
  citeOpen,
  onCiteOpenChange,
}: {
  article: Article
  files: readonly ArticleFile[]
  citeOpen: boolean
  onCiteOpenChange: (open: boolean) => void
}) {
  const primary = files.find((f) => f.primary)
  const others = files.filter((f) => !f.primary && !isRecord(f))
  return (
    <>
      <div className="mt-4 hidden flex-wrap items-baseline gap-x-6 gap-y-2 font-sans text-ui md:flex print:hidden">
        {primary ? <PdfLink file={primary} /> : null}
        <SupplementaryLinks files={others} />
        <CiteMenu
          card={article}
          keyHint="c"
          open={citeOpen}
          onOpenChange={onCiteOpenChange}
          variant="ghost"
          className={TEXT_TRIGGER}
        />
      </div>
      <PhoneActions article={article} primary={primary} others={others} />
    </>
  )
}

function PhoneActions({
  article,
  primary,
  others,
}: {
  article: Article
  primary: ArticleFile | undefined
  others: readonly ArticleFile[]
}) {
  const { state, copy } = useCopy()
  const pdf = primary && !/\bto fetch\s*$/i.test(primary.label) ? resolveHref(primary.href) : null
  const kind = primary ? pdfQualifier(primary.label) : ""
  const cites: [string, string][] = [
    ["Copy the key", article.key],
    ["Copy \\cite{…}", latexCite(article.key)],
    ["Copy the BibTeX entry", bibtex(article)],
    ["Copy the reference", formatReference(article)],
  ]
  return (
    <div className="mt-5 flex gap-2 md:hidden print:hidden">
      {pdf ? (
        <Button asChild variant="outline" className="h-11 flex-1 text-ui">
          <a href={pdf.href} target="_blank" rel="noopener noreferrer">
            PDF
            {kind ? <span className="font-normal opacity-80">{kind}</span> : null}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      ) : primary ? (
        // Words, as on wide screens: no box for a file that is not here yet.
        <span
          className="flex h-11 flex-1 items-center text-ui text-muted-foreground"
          title="Not on this computer yet"
        >
          {primary.label}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-lg"
            className="size-11"
            aria-label={state === "copied" ? "Copied" : "More: files and citations"}
          >
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
          {cites.map(([label, text]) => (
            <DropdownMenuItem key={label} onSelect={() => void copy(text)}>
              {label}
            </DropdownMenuItem>
          ))}
          {others.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <SupplementaryItems files={others} />
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" className="sr-only">
        {state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : ""}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------- the header

/**
 * The top of an article: a warning when it was retracted, the kicker (its bibliography and its place
 * in the list), the cite line, the title, the authors, the venue, the quiet notices, the files and
 * the Cite menu.
 */
export function ArticleHeader({
  entry,
  view,
  place,
  from,
  titleRef,
  citeOpen,
  onCiteOpenChange,
  top,
  main,
}: {
  entry: ArticleEntry
  view: ArticleView | undefined
  place: ListPosition
  from: string
  titleRef: Ref<HTMLHeadingElement>
  citeOpen: boolean
  onCiteOpenChange: (open: boolean) => void
  /** Where its top (warnings, kicker, cite line) and its main part (title to files) sit. */
  top?: string
  main?: string
}) {
  const { article } = entry
  return (
    // Its two parts are items of the page's grid: the facts align with the title.
    <header className="contents">
      <div className={top}>
        <ArticleNotices notices={article.notices} placement="serious" />
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Kicker entry={entry} place={place} from={from} />
          {view?.draft ? (
            <span title="The curation of this article is not finished: sections may be missing.">
              <DraftBadge />
              <span className="sr-only">
                : the curation is not finished, sections may be missing.
              </span>
            </span>
          ) : null}
        </div>
        <div className="mt-1">
          <CiteKicker article={article} view={view} />
        </div>
      </div>
      <div className={main}>
        <h1
          ref={titleRef}
          tabIndex={-1}
          id="article-title"
          className="display text-foreground outline-none"
        >
          {typeset(article.title)}
        </h1>
        {article.authors ? <AuthorsLine authors={article.authors} /> : null}
        {view ? <VenueLine meta={view.meta} /> : null}
        <ArticleNotices notices={article.notices} placement="quiet" />
        {view ? (
          <FilesLine
            article={article}
            files={view.files}
            citeOpen={citeOpen}
            onCiteOpenChange={onCiteOpenChange}
          />
        ) : null}
      </div>
    </header>
  )
}
