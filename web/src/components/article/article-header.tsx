"use client"

import { ChevronDownIcon, EllipsisIcon, ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { Fragment, useId, useRef, useState, type Ref } from "react"

import { CiteMenu } from "@/components/content/cite-menu"
import { CopyButton, useCopy } from "@/components/content/copy-button"
import { IdentityIcon } from "@/components/content/identity"
import { InlineContent } from "@/components/content/inline"
import { DraftBadge } from "@/components/content/notice-badge"
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
  plainText,
  resolveHref,
  type Article,
  type ArticleEntry,
  type ArticleFile,
  type ArticleView,
  type Inlines,
} from "@/lib/data"
import { formatDate, formatNumber } from "@/lib/format"
import { APP } from "@/lib/identity"
import { routes, type ListKind } from "@/lib/routes"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { clauseOf, saysSomething } from "./article-model"
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
    <p className="flex flex-wrap items-baseline gap-x-2 font-sans text-small text-muted-foreground">
      <span className="font-medium text-foreground/80">{bibName(entry)}</span>
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

// ---------------------------------------------------------------------------- the reference

/**
 * The place the record names ("Northfield Institute of Synthetic Ecology"), from the view's kicker
 * "<cite> · <place>"; none when not reported.
 */
function placeOf(article: Article, view: ArticleView | undefined): Inlines {
  const kicker = view?.kicker ?? []
  const rest = typeof kicker[0] === "string" && kicker[0] === article.cite ? kicker.slice(2) : []
  return saysSomething(rest) ? rest : []
}

/** The lab, its first clause ("Fictional Soil Sensing Lab"); none when the record names none. */
function labOf(view: ArticleView | undefined): Inlines {
  const lab = view?.lab ?? []
  const first = lab[0]
  const muted = first !== undefined && typeof first !== "string" && first.t === "muted"
  if (!saysSomething(lab) || muted || /^\s*not reported\b/iu.test(plainText(lab))) return []
  return clauseOf(lab, { max: 48, paren: true }).parts
}

function isEllipsis(name: string): boolean {
  return name === "…" || name === "..."
}

/** Authors shown whole up to this many; more fold to the first three and the last. */
const AUTHORS_SHOWN = 5

/**
 * The authors: every name when there are few; else the first three, "…" and the last, and "+n"
 * unfolds them all (`authors_full`). The first and the last in ink. Without the full list, the
 * card's short line ("Lindqvist, Herrera, … Abernathy (12 authors)").
 */
function Authors({ article }: { article: Article }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const full = article.authors_full ?? []
  if (full.length === 0) return <ShortAuthors authors={article.authors} />
  const folds = full.length > AUTHORS_SHOWN
  const shown = folds && !open ? [...full.slice(0, 3), "…", full[full.length - 1]!] : full
  const ends = new Set([full[0], full[full.length - 1]])
  return (
    <span id={id}>
      {shown.map((name, i) =>
        isEllipsis(name) ? (
          <Fragment key={i}>
            {" "}
            <span aria-hidden="true">…</span>
            <span className="sr-only">and {formatNumber(full.length - 4)} others,</span>
          </Fragment>
        ) : (
          <Fragment key={i}>
            {i === 0 ? "" : isEllipsis(shown[i - 1] ?? "") ? " " : ", "}
            <span className={cn("whitespace-nowrap", ends.has(name) && "text-foreground")}>
              {typeset(name)}
            </span>
          </Fragment>
        )
      )}
      {folds ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? "Show fewer authors" : `Show all ${formatNumber(full.length)} authors`}
          onClick={() => setOpen(!open)}
          className="ml-2 rounded-[4px] px-1 font-medium whitespace-nowrap text-muted-foreground num hover:bg-muted hover:text-foreground"
        >
          {open ? "Fewer" : `+${formatNumber(full.length - 4)}`}
        </button>
      ) : null}
    </span>
  )
}

/** The card's short line of authors, the first and the last in ink, each name kept whole. */
function ShortAuthors({ authors }: { authors: string }) {
  const count = /\s*\((\d+)\s+authors?\)\s*$/u.exec(authors)
  const names = authors
    .slice(0, count ? count.index : undefined)
    .split(/\s*,\s*/u)
    .map((n) => n.trim())
    .filter(Boolean)
  const real = names.filter((n) => !isEllipsis(n))
  const firstLast = real.length > 2 ? new Set([real[0], real[real.length - 1]]) : new Set<string>()
  return (
    <span>
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
    </span>
  )
}

const ISO_DATE = /\b\d{4}-\d{2}(?:-\d{2})?\b/u

interface Identifier {
  /** "DOI", "PMID", "PMCID", "Volume", "Published", or a link's own words. */
  name: string
  value: string
  /** Where it opens (a new tab), if anywhere. */
  href?: string
  /** An identifier in the mono (a DOI, a PMID); a volume or a date in the sans. */
  mono: boolean
}

/**
 * The reference's identifiers, kept out of the lines (one control away): the DOI, PMID and PMCID
 * the venue line links to, any other link, then the volume, issue and pages, and the date.
 */
export function identifiersOf(article: Article, meta: Inlines): Identifier[] {
  const out: Identifier[] = []
  let date = ""
  for (const part of meta) {
    if (typeof part === "string") {
      date ||= ISO_DATE.exec(part)?.[0] ?? ""
      continue
    }
    if (part.t !== "a") continue
    const link = resolveHref(part.href)
    if (!link) continue
    const host = /^https?:\/\/([^/]+)/u.exec(link.href)?.[1] ?? ""
    if (/(^|\.)doi\.org$/u.test(host)) {
      out.push({
        name: "DOI",
        value: part.text.replace(/^doi:\s*/iu, ""),
        href: link.href,
        mono: true,
      })
    } else if (/^pubmed\.ncbi\.nlm\.nih\.gov$/u.test(host)) {
      out.push({
        name: "PMID",
        value: part.text.replace(/^PMID\s*/iu, ""),
        href: link.href,
        mono: true,
      })
    } else if (/^(pmc\.)?ncbi\.nlm\.nih\.gov$/u.test(host) && /PMC\d+/u.test(part.text)) {
      out.push({ name: "PMCID", value: part.text, href: link.href, mono: true })
    } else {
      out.push({ name: part.text, value: link.href, href: link.href, mono: true })
    }
  }
  if (!out.some((x) => x.name === "DOI") && article.doi) {
    out.unshift({
      name: "DOI",
      value: article.doi,
      href: `https://doi.org/${article.doi}`,
      mono: true,
    })
  }
  const issue = article.issue ? ` (${article.issue})` : ""
  const volume =
    `${article.volume ?? ""}${issue}${article.pages ? `: ${article.pages}` : ""}`.trim()
  if (volume) out.push({ name: "Volume", value: volume, mono: false })
  if (date) out.push({ name: "Published", value: formatDate(date), mono: false })
  return out
}

/** The identifiers' panel: each with a copy control and, for a link, one that opens it. */
function Identifiers({
  id,
  items,
  onClose,
}: {
  id: string
  items: Identifier[]
  onClose: () => void
}) {
  return (
    <div
      id={id}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation()
          onClose()
        }
      }}
      className="mt-3 border-l border-border pl-3"
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
        {items.map((item) => (
          <Fragment key={item.name}>
            <dt className="font-sans text-small text-muted-foreground">{item.name}</dt>
            <dd
              className={cn(
                "min-w-0 py-1 break-words text-foreground",
                item.mono ? "mono text-kbd" : "font-sans text-small"
              )}
            >
              {item.value}
            </dd>
            <dd className="flex items-center justify-end">
              <CopyButton value={item.value} iconOnly what={`the ${item.name}`} />
              {item.href ? (
                <Button asChild variant="ghost" size="icon-sm">
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open the ${item.name} (new tab)`}
                  >
                    <ExternalLinkIcon aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}

/**
 * The reference as three lines, each marked by its identity: the authors, the university (and the
 * lab), the journal and its year. The volume, the date and the identifiers are one control away
 * ("IDs"): they are copied and opened, rarely read.
 */
function ReferenceLines({ article, view }: { article: Article; view: ArticleView | undefined }) {
  const [idsOpen, setIdsOpen] = useState(false)
  const idsId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const place = placeOf(article, view)
  const lab = labOf(view)
  const journal = view?.meta.find((p) => typeof p !== "string" && p.t === "em")
  const venue = journal && typeof journal !== "string" ? journal.text : article.venue
  const ids = identifiersOf(article, view?.meta ?? [])
  const line = "flex min-w-0 items-start gap-2.5"
  const icon = "mt-0.5"
  return (
    <div className="mt-5 font-sans text-ui text-pretty text-muted-foreground">
      <ul className="space-y-1.5">
        {article.authors ? (
          <li className={line}>
            <IdentityIcon identity={APP.author} className={icon} />
            <span className="min-w-0">
              <span className="sr-only">Authors: </span>
              <Authors article={article} />
            </span>
          </li>
        ) : null}
        {place.length > 0 ? (
          <li className={line}>
            <IdentityIcon identity={APP.university} className={icon} />
            <span className="min-w-0">
              <span className="sr-only">Affiliation: </span>
              <span className="text-foreground/85">
                <InlineContent parts={place} acronyms={false} />
              </span>
              {lab.length > 0 ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <InlineContent parts={lab} acronyms={false} />
                </>
              ) : null}
            </span>
          </li>
        ) : null}
        {venue || article.year ? (
          <li className={line}>
            <IdentityIcon identity={APP.journal} className={icon} />
            <span className="min-w-0">
              <span className="sr-only">Journal: </span>
              {venue ? (
                <i className="font-serif text-note text-foreground">{typeset(venue)}</i>
              ) : null}
              {venue && article.year ? <span aria-hidden="true"> · </span> : null}
              {article.year ? <span className="num">{article.year}</span> : null}
              {ids.length > 0 ? (
                <button
                  ref={toggleRef}
                  type="button"
                  aria-expanded={idsOpen}
                  aria-controls={idsId}
                  title="DOI, PMID, volume and date"
                  onClick={() => setIdsOpen(!idsOpen)}
                  className="ml-2 inline-flex translate-y-[-1px] items-center gap-1 rounded-[4px] px-1.5 align-middle text-small font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground print:hidden"
                >
                  <IdentityIcon identity={APP.identifiers} className="size-3.5" />
                  IDs
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 transition-transform duration-150",
                      idsOpen && "rotate-180"
                    )}
                  />
                </button>
              ) : null}
            </span>
          </li>
        ) : null}
      </ul>
      {idsOpen ? (
        <Identifiers
          id={idsId}
          items={ids}
          onClose={() => {
            setIdsOpen(false)
            toggleRef.current?.focus()
          }}
        />
      ) : null}
    </div>
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
 * in the list), the title, the reference's lines (authors, university, journal; the identifiers one
 * control away), the quiet notices, the files and the Cite menu.
 */
export function ArticleHeader({
  entry,
  view,
  place,
  from,
  titleRef,
  citeOpen,
  onCiteOpenChange,
}: {
  entry: ArticleEntry
  view: ArticleView | undefined
  place: ListPosition
  from: string
  titleRef: Ref<HTMLHeadingElement>
  citeOpen: boolean
  onCiteOpenChange: (open: boolean) => void
}) {
  const { article } = entry
  return (
    <header className="min-w-0">
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
      <h1
        ref={titleRef}
        tabIndex={-1}
        id="article-title"
        className="mt-3 display text-foreground outline-none"
      >
        {typeset(article.title)}
      </h1>
      <ReferenceLines article={article} view={view} />
      <ArticleNotices notices={article.notices} placement="quiet" />
      {view ? (
        <FilesLine
          article={article}
          files={view.files}
          citeOpen={citeOpen}
          onCiteOpenChange={onCiteOpenChange}
        />
      ) : null}
    </header>
  )
}
