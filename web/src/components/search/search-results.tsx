"use client"

import Link from "next/link"
import { memo, type KeyboardEvent, type MouseEvent } from "react"

import { CiteLine } from "@/components/content/cite"
import { SeriousNoticeBadge } from "@/components/content/notice-badge"
import { PageMark } from "@/components/content/page-mark"
import type { SearchHit } from "@/lib/api"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

import { MarkedText } from "./highlight"
import { hitPlace, type HitGroup, type HitPlace } from "./hits"
import { PassageWords } from "./passage-text"

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

/** Where a passage comes from, above its words: the summary's section, or a file and its role. */
function PlaceLine({ place }: { place: HitPlace }) {
  if (place.kind === "record") {
    return <span className="mb-0.5 block label">{place.section}</span>
  }
  if (!place.file) return null
  return (
    <span className="mb-1 flex min-w-0 items-baseline gap-2 text-small text-muted-foreground">
      {place.file.role ? (
        <span className="shrink-0 font-sans font-medium text-foreground/80">{place.file.role}</span>
      ) : null}
      <span className="truncate-fade min-w-0 font-mono text-kbd">{place.file.name}</span>
    </span>
  )
}

const Passage = memo(function Passage({
  hit,
  place,
  terms,
  current,
  readerId,
  handlers,
}: {
  hit: SearchHit
  place: HitPlace
  terms: readonly string[]
  current: boolean
  readerId: string | undefined
  handlers: RowHandlers
}) {
  return (
    <li
      className={cn(
        "group/row relative grid grid-cols-[minmax(0,1fr)_auto] transition-colors duration-150",
        current ? "bg-muted" : "hover:bg-muted/60"
      )}
      data-touch-row=""
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
        className="block min-w-0 py-2 pr-2 pl-4 text-left focus-visible:outline-none"
      >
        <PlaceLine place={place} />
        <span className="block font-serif text-note text-pretty [font-variant-numeric:oldstyle-nums_proportional-nums]">
          <PassageWords hit={hit} place={place} terms={terms} />
        </span>
      </button>
      <span className="pt-2 pr-4 pl-1 text-right text-note leading-6">
        {place.page ? (
          <PageMark page={place.page.page} doc={place.page.doc} href={place.page.href}>
            {place.page.text}
          </PageMark>
        ) : null}
      </span>
    </li>
  )
})

const Group = memo(function Group({
  group,
  places,
  terms,
  currentRef,
  readerId,
  from,
  handlers,
}: {
  group: HitGroup
  places: ReadonlyMap<string, HitPlace>
  terms: readonly string[]
  currentRef: string | null
  readerId: string | undefined
  from: string
  handlers: RowHandlers
}) {
  const article = group.entry?.article
  const headingId = `group-${group.ref}`
  return (
    <section aria-labelledby={headingId} className="border-b border-border py-4 first:pt-1">
      <header className="px-4 pb-1.5">
        <h2 id={headingId} className="item-title text-item">
          <Link
            href={routes.article(group.bib, group.key, undefined, { from })}
            className="decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] underline-offset-[0.18em] hover:underline pointer-coarse:py-2.5"
          >
            {article ? <MarkedText text={article.title} terms={terms} /> : group.cite}
          </Link>
        </h2>
        {article ? (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-serif text-gloss text-muted-foreground">
            <CiteLine card={article} />
            <SeriousNoticeBadge notices={article.notices} />
            <span className="ml-auto font-sans text-kbd">
              {group.entry?.bib.short || group.bib}
            </span>
          </p>
        ) : null}
      </header>
      <ol>
        {group.hits.map((hit) => (
          <Passage
            key={hit.ref}
            hit={hit}
            place={places.get(hit.ref) ?? hitPlace(hit, group.entry)}
            terms={terms}
            current={hit.ref === currentRef}
            readerId={readerId}
            handlers={handlers}
          />
        ))}
      </ol>
    </section>
  )
})

/**
 * The passages found, grouped by article: the article's title (a link to it) and its citation, then
 * each passage with where it comes from and its page mark at the right. One passage is current (the
 * reader shows it on wide screens); it alone is in the tab order, ↑ ↓ move.
 */
export function SearchResults({
  groups,
  places,
  terms,
  currentRef,
  readerId,
  from,
  busy,
  handlers,
}: {
  groups: readonly HitGroup[]
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
          places={places}
          terms={terms}
          currentRef={currentRef}
          readerId={readerId}
          from={from}
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
            <div key={j} className="space-y-2 pt-2">
              <div className="h-2.5 w-full rounded-[2px] bg-muted" />
              <div className="h-2.5 w-4/5 rounded-[2px] bg-muted" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
