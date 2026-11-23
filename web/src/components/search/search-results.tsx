"use client"

import Link from "next/link"
import { Fragment, memo, type KeyboardEvent, type MouseEvent } from "react"

import { CiteLine } from "@/components/content/cite"
import { IdentityIcon } from "@/components/content/identity"
import { SeriousNoticeBadge } from "@/components/content/notice-badge"
import { PageMark } from "@/components/content/page-mark"
import type { SearchHit } from "@/lib/api"
import { referenceParts, splitName } from "@/lib/cite"
import type { Article } from "@/lib/data"
import { FAMILY_TEXT } from "@/lib/identity"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

import { guessLang } from "@/lib/lang"

import { MarkedText } from "./highlight"
import { hitPlace, type HitPlace } from "./hits"
import {
  authorPlace,
  KINDS,
  linesOf,
  type AuthorMatch,
  type KindCount,
  type KindedGroup,
  type KindedHit,
  type MatchKind,
} from "./kinds"
import { Cut, PassageWords } from "./passage-text"
import { fragmentAround, tidySnippet } from "./snippet"

/** What a row does, by the reader's gesture; the page decides (wide: preview; narrow: a sheet). */
export interface RowHandlers {
  /** A click, or Space: preview the passage (wide) or open it in the reader (narrow). */
  onChoose: (hit: SearchHit) => void
  /** Enter, or a double click: the article at the passage's section. */
  onOpen: (hit: SearchHit) => void
  /** The keys of a row (↑ ↓ Home End p c y Esc), handled by the page. */
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>, hit: SearchHit) => void
}

/** The row's element of a passage (its button), for focus. */
export function passageElement(ref: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-passage]")) {
    if (el.dataset.ref === ref) return el
  }
  return null
}

/** A kind's word at the start of a line, in its family's ink ("Cites", "Key metrics"). */
function KindWord({ kind, place }: { kind: MatchKind; place?: HitPlace }) {
  // A file says what it is when its first page or its record does ("Referee report").
  const file = kind.key === "supplementary" || kind.key === "review"
  const words = file ? (place?.file?.role ?? kind.label) : kind.label
  return (
    <span
      className={cn(
        "mr-1.5 font-sans text-small font-semibold",
        kind.identity ? FAMILY_TEXT[kind.identity.family] : "text-muted-foreground"
      )}
    >
      {words}
    </span>
  )
}

/** A line's icon, or the room of one: the lines' words start at the same place. */
function LineIcon({ kind }: { kind: MatchKind }) {
  return kind.identity?.icon ? (
    <IdentityIcon identity={kind.identity} className="mt-[0.1875rem]" />
  ) : (
    <span aria-hidden="true" className="size-4 shrink-0" />
  )
}

/** Kinds whose words are a page of a file: shown around their first match, so the match shows. */
const FILE_KINDS = new Set(["paper", "cites", "supplementary", "review"])

/**
 * A file's passage around its first match (about two lines of the list), its cuts said with "…";
 * the passage as it is when nothing in it matches.
 */
function AroundMatch({
  hit,
  place,
  terms,
}: {
  hit: SearchHit
  place: HitPlace
  terms: readonly string[]
}) {
  const tidy = tidySnippet(hit.snippet, terms)
  const around = fragmentAround(tidy.text, terms, 130)
  if (!around) return <PassageWords hit={hit} place={place} terms={terms} />
  return (
    <>
      {around.cutStart || tidy.cutStart ? <Cut /> : null}
      <MarkedText text={around.text} terms={terms} grade acronyms lang={guessLang(around.text)} />
      {around.cutEnd || tidy.cutEnd ? <Cut /> : null}
    </>
  )
}

const Passage = memo(function Passage({
  line,
  place,
  author,
  terms,
  current,
  readerId,
  handlers,
}: {
  line: KindedHit
  place: HitPlace
  /** The author the query names, for an author's line ("1st of 12"). */
  author: AuthorMatch | null
  terms: readonly string[]
  current: boolean
  readerId: string | undefined
  handlers: RowHandlers
}) {
  const { hit, kind } = line
  return (
    <li
      className={cn(
        "group/row relative grid grid-cols-[minmax(0,1fr)_auto] transition-colors duration-150",
        current ? "bg-muted" : "hover:bg-muted/60"
      )}
      data-touch-row=""
      data-kind={kind.key}
    >
      {/* Focus: the wash and a 2 px ink bar on its left edge, as a hub's row and an inbox paper. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 bg-foreground opacity-0 group-has-[[data-passage]:focus-visible]/row:opacity-100"
      />
      <button
        type="button"
        data-passage=""
        data-ref={hit.ref}
        tabIndex={current ? 0 : -1}
        aria-current={current ? "true" : undefined}
        aria-controls={readerId}
        aria-keyshortcuts="Enter p c y"
        onClick={() => handlers.onChoose(hit)}
        onDoubleClick={(e: MouseEvent) => {
          e.preventDefault()
          handlers.onOpen(hit)
        }}
        onKeyDown={(e) => handlers.onKeyDown(e, hit)}
        className="flex min-w-0 items-start gap-2.5 py-1.5 pr-2 pl-4 text-left focus-visible:outline-none"
      >
        <LineIcon kind={kind} />
        <span className="clamp-fade-2 block min-w-0 font-serif text-note text-pretty [font-variant-numeric:oldstyle-nums_proportional-nums]">
          <KindWord kind={kind} place={place} />
          {kind.key === "author" && author ? (
            <span className="font-sans text-small text-muted-foreground">
              {authorPlace(author)}
            </span>
          ) : FILE_KINDS.has(kind.key) ? (
            <AroundMatch hit={hit} place={place} terms={terms} />
          ) : (
            <PassageWords hit={hit} place={place} terms={terms} />
          )}
        </span>
      </button>
      <span className="pt-1.5 pr-4 pl-1 text-right text-small leading-6">
        {place.page ? (
          <PageMark page={place.page.page} doc={place.page.doc} href={place.page.href}>
            {place.page.text}
          </PageMark>
        ) : null}
      </span>
    </li>
  )
})

/**
 * The cite line of an article the query names as an author: that author's name marked, where it
 * stands ("Herrera, **Lindqvist** et al. 2026", "Herrera, …, **Lindqvist** et al. 2026").
 */
function AuthorCite({
  article,
  author,
  terms,
}: {
  article: Article
  author: AuthorMatch
  terms: readonly string[]
}) {
  const { names, year, venue } = referenceParts(article)
  const first = names[0] ?? ""
  const family = splitName(author.name).family || author.name
  const lead = author.index === 0 || !first ? [] : author.index === 1 ? [first] : [first, "…"]
  return (
    <span className="cite">
      {lead.map((name, i) => (
        <Fragment key={i}>
          {name === "…" ? (
            "…, "
          ) : (
            <>
              <span className="au">{name}</span>,{" "}
            </>
          )}
        </Fragment>
      ))}
      <span className="au">
        <MarkedText text={family} terms={terms} />
      </span>
      {author.index < author.total - 1 ? " et al." : null}
      {year ? ` ${year}` : null}
      {venue ? (
        <>
          {" · "}
          <i>{venue}</i>
        </>
      ) : null}
    </span>
  )
}

const Group = memo(function Group({
  group,
  kind,
  places,
  terms,
  currentRef,
  readerId,
  from,
  showBib,
  handlers,
}: {
  group: KindedGroup
  /** The kind the results are filtered by ("all"). */
  kind: string
  places: ReadonlyMap<string, HitPlace>
  terms: readonly string[]
  currentRef: string | null
  readerId: string | undefined
  from: string
  /** The results come from several bibliographies: each article names its own. */
  showBib: boolean
  handlers: RowHandlers
}) {
  const article = group.entry?.article
  const headingId = `group-${group.ref}`
  const lines = linesOf(group, kind)
  // An author the query names, though no passage of the results lists the authors: said once.
  const authorLine =
    group.author &&
    (kind === "all" || kind === "author") &&
    !lines.some((l) => l.kind.key === "author")
  return (
    <section aria-labelledby={headingId} className="border-b border-border py-4 first:pt-1">
      <header className="px-4 pb-1">
        <h2 id={headingId} className="item-title text-item">
          <Link
            href={routes.article(group.bib, group.key, undefined, { from })}
            className="decoration-link-line underline-offset-[0.18em] hover:underline pointer-coarse:py-2.5"
          >
            {article ? <MarkedText text={article.title} terms={terms} /> : group.cite}
          </Link>
        </h2>
        {article ? (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-serif text-gloss text-muted-foreground">
            {group.author ? (
              <AuthorCite article={article} author={group.author} terms={terms} />
            ) : (
              <CiteLine card={article} />
            )}
            <SeriousNoticeBadge notices={article.notices} />
            {showBib ? (
              <span className="ml-auto font-sans text-kbd">
                {group.entry?.bib.short || group.bib}
              </span>
            ) : null}
          </p>
        ) : null}
      </header>
      {authorLine || lines.length > 0 ? (
        <ol className="mt-1">
          {authorLine && group.author ? (
            <li className="flex items-start gap-2.5 py-1.5 pr-4 pl-4 font-serif text-note">
              <LineIcon kind={KINDS.author} />
              <span className="min-w-0">
                <KindWord kind={KINDS.author} />
                <span className="font-sans text-small text-muted-foreground">
                  {authorPlace(group.author)}
                </span>
              </span>
            </li>
          ) : null}
          {lines.map((line) => (
            <Passage
              key={line.hit.ref}
              line={line}
              place={places.get(line.hit.ref) ?? hitPlace(line.hit, group.entry)}
              author={group.author}
              terms={terms}
              current={line.hit.ref === currentRef}
              readerId={readerId}
              handlers={handlers}
            />
          ))}
        </ol>
      ) : null}
    </section>
  )
})

/**
 * The kinds of the results as one row of filters, each with its icon and its count of articles:
 * one click shows that kind alone, a second (or All) shows everything again. Curation notes come
 * last, quiet: they are left out of All.
 */
export function KindFilter({
  counts,
  all,
  kind,
  onKind,
}: {
  counts: readonly KindCount[]
  /** The articles All shows. */
  all: number
  kind: string
  onKind: (kind: string) => void
}) {
  const chip =
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] border border-rule-strong px-2.5 font-sans text-small font-medium text-foreground/85 transition-colors duration-150 hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted aria-pressed:text-foreground pointer-coarse:h-11"
  return (
    <div
      role="group"
      aria-label="Show one kind of match"
      className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 pt-0.5 pb-3 [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        aria-pressed={kind === "all"}
        onClick={() => onKind("all")}
        className={chip}
      >
        All <span className="font-normal text-muted-foreground num">{all}</span>
      </button>
      {counts.map(({ kind: k, articles }) => (
        <button
          key={k.key}
          type="button"
          aria-pressed={kind === k.key}
          onClick={() => onKind(kind === k.key ? "all" : k.key)}
          className={cn(chip, k.key === "curation" && "text-muted-foreground")}
        >
          <IdentityIcon identity={k.identity} className="size-3.5" />
          {k.label} <span className="font-normal text-muted-foreground num">{articles}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The articles found, each its title (a link to it), its cite line (the author the query names
 * marked), then one line per passage: its kind's icon and word in the family's ink, the passage, its
 * page at the right. Filtered by `kind`. One passage is current (the reader shows it on wide
 * screens); it alone is in the tab order, ↑ ↓ move.
 */
export function SearchResults({
  groups,
  kind,
  places,
  terms,
  currentRef,
  readerId,
  from,
  busy,
  handlers,
}: {
  groups: readonly KindedGroup[]
  kind: string
  places: ReadonlyMap<string, HitPlace>
  terms: readonly string[]
  currentRef: string | null
  /** The reader's id while it is on the page (for aria-controls). */
  readerId: string | undefined
  /** The list's URL, carried to the articles (`from`). */
  from: string
  /** A newer answer is on its way: the results stay, dimmed. */
  busy: boolean
  handlers: RowHandlers
}) {
  const showBib = new Set(groups.map((g) => g.bib)).size > 1
  return (
    <div
      data-results=""
      aria-busy={busy || undefined}
      className={cn("transition-opacity duration-150", busy && "opacity-55")}
    >
      {groups.map((group) => (
        <Group
          key={group.ref}
          group={group}
          kind={kind}
          places={places}
          terms={terms}
          currentRef={currentRef}
          readerId={readerId}
          from={from}
          showBib={showBib}
          handlers={handlers}
        />
      ))}
    </div>
  )
}

/** The results' shape while the first answer loads (shown after 200 ms: a fast answer shows none). */
export function ResultsSkeleton() {
  return (
    <div aria-hidden className="animate-skeleton-in">
      {[3, 2, 2].map((passages, i) => (
        <div key={i} className="space-y-2 border-b border-border px-4 py-4">
          <div className="h-[0.6875rem] w-3/5 rounded-[2px] bg-muted" />
          <div className="h-2 w-1/3 rounded-[2px] bg-muted" />
          {Array.from({ length: passages }, (_, j) => (
            <div key={j} className="flex gap-2.5 pt-2">
              <div className="size-4 shrink-0 rounded-[2px] bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 w-full rounded-[2px] bg-muted" />
                <div className="h-2.5 w-4/5 rounded-[2px] bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
