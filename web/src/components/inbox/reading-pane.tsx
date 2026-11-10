"use client"

import Link from "next/link"
import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react"

import { CliCommand } from "@/components/content/cli-command"
import { PriorNote } from "@/components/content/relevance"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { useFromHere } from "@/hooks/use-list-memory"
import { referenceParts } from "@/lib/cite"
import { doiHref, useLibrary, type InboxPaper } from "@/lib/data"
import { formatCount, formatDate, shortVenue } from "@/lib/format"
import type { ApiState, Decision } from "@/lib/inbox-decisions"
import { guessLang } from "@/lib/lang"
import { routes } from "@/lib/routes"
import { commands } from "@/lib/site"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"
import { Typeset } from "@/components/content/typeset"

import type { FailedDecision } from "./decide"
import { citesOf, kindLabel, parseQuery, sourceList, type InboxRow } from "./inbox-model"
import { authorLine, NEW_TAB, paperLinks, useBibName } from "./paper-parts"

export const PANE_ID = "inbox-reading-pane"
export const PANE_SUMMARY_ID = `${PANE_ID}-summary`
export const PANE_TITLE_ID = `${PANE_ID}-title`

export interface ReadingPaneProps {
  row: InboxRow
  /** "3 of 26" in the decision bar (null: not among the papers shown). */
  position: { n: number; of: number } | null
  expanded: boolean
  api: ApiState
  onDecide: (id: string, decision: Decision) => void
  onUndo: () => void
  onToggleExpand: () => void
  /**
   * `pane`: beside the list, scrolling on its own, its decision bar at its foot. `page`: the paper
   * on the whole screen (phones, tablets), the page scrolls, the bar sticks to the bottom.
   */
  layout: "pane" | "page"
  /** The pane's scrolling box (Space scrolls it). */
  scrollRef?: RefObject<HTMLDivElement | null>
  headingRef?: Ref<HTMLHeadingElement>
  /** What sits on the decision bar, above it (the page layout's status line). */
  status?: ReactNode
  /** Whether a and r decide this paper (false while a selection takes them). */
  keysDecide?: boolean
  /** A decision on it that was not saved. */
  failure?: FailedDecision | null
}

/**
 * The current paper as a glossed page: the title, the meta line and the links; the triage summary
 * and the abstract in the text column; the reason, the library's articles it cites, the prior, its
 * kind in the margin beside them (a pane at least 760 px wide; narrower, under the summary); the
 * details folded at the end; the decision bar after them (sticking to the pane's foot when the paper
 * is longer than the pane).
 */
export function ReadingPane({
  row,
  position,
  expanded,
  api,
  onDecide,
  onUndo,
  onToggleExpand,
  layout,
  scrollRef,
  headingRef,
  status,
  keysDecide = true,
  failure = null,
}: ReadingPaneProps) {
  const { paper } = row
  const inPane = layout === "pane"
  // A fresh scroll position for each paper (the pane is patched, not drawn anew, as j moves on).
  const own = useRef<HTMLDivElement | null>(null)
  const scroller = scrollRef ?? own
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [paper.id, scroller])
  // Beside the list, the bar follows the paper (no empty band under a short one) and sticks to the
  // pane's foot when the paper is longer; on the whole screen it stays at the bottom, in thumb reach.
  const bar = (
    <DecisionBar
      row={row}
      position={position}
      api={api}
      onDecide={onDecide}
      onUndo={onUndo}
      layout={layout}
      statusLine={status}
      keys={keysDecide}
      failure={failure}
    />
  )
  return (
    <section
      id={PANE_ID}
      aria-labelledby={PANE_TITLE_ID}
      className={cn("@container flex min-h-0 flex-col", inPane ? "h-full" : "flex-1")}
    >
      <div
        ref={scroller}
        className={cn(
          "flex-1",
          inPane && "min-h-0 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain pr-1"
        )}
      >
        {/* One column for the paper, its rules and its bar: they end on one right edge. */}
        <div className={cn(inPane && "max-w-[52rem]")}>
          <PaperBody
            paper={paper}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            headingRef={headingRef}
          />
          {inPane ? bar : null}
        </div>
      </div>
      {inPane ? null : bar}
    </section>
  )
}

function PaperBody({
  paper,
  expanded,
  onToggleExpand,
  headingRef,
}: {
  paper: InboxPaper
  expanded: boolean
  onToggleExpand: () => void
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const titleLang = guessLang(paper.title)
  return (
    <article className="pb-6">
      <header className="max-w-[48rem]">
        <h2
          ref={headingRef}
          id={PANE_TITLE_ID}
          lang={titleLang}
          tabIndex={-1}
          className="title text-foreground outline-none"
        >
          {typeset(paper.title, titleLang)}
        </h2>
        <Byline paper={paper} />
        <PaperLinks paper={paper} />
      </header>
      <div className="mt-5 grid grid-cols-1 gap-x-8 @min-[47.5rem]:grid-cols-[minmax(0,32rem)_minmax(12.5rem,1fr)]">
        <div className="min-w-0 @min-[47.5rem]:col-start-1 @min-[47.5rem]:row-start-1">
          <Summary paper={paper} />
        </div>
        <aside
          aria-label="Why it is here"
          className="mt-5 min-w-0 border-l border-border pl-4 @min-[47.5rem]:col-start-2 @min-[47.5rem]:row-span-2 @min-[47.5rem]:row-start-1 @min-[47.5rem]:mt-0.5 @min-[47.5rem]:max-w-[18rem] @min-[47.5rem]:border-l-0 @min-[47.5rem]:pl-0"
        >
          <Gloss paper={paper} />
        </aside>
        <div className="min-w-0 @min-[47.5rem]:col-start-1 @min-[47.5rem]:row-start-2">
          <Abstract paper={paper} expanded={expanded} onToggle={onToggleExpand} />
        </div>
      </div>
      <Details paper={paper} />
    </article>
  )
}

/** Authors, venue and date: one quiet line. */
function Byline({ paper }: { paper: InboxPaper }) {
  const authors = authorLine(paper.authors)
  const parts: ReactNode[] = []
  if (authors)
    parts.push(
      <span key="a" title={paper.authors.length > 4 ? paper.authors.join(", ") : undefined}>
        {authors}
      </span>
    )
  if (paper.venue)
    parts.push(
      <span key="v" title={paper.venue}>
        {shortVenue(paper.venue)}
      </span>
    )
  if (paper.date)
    parts.push(
      <time key="d" dateTime={paper.date}>
        {formatDate(paper.date)}
      </time>
    )
  if (!parts.length) return null
  return (
    <p className="mt-1.5 font-sans text-small text-muted-foreground">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? (
            <span aria-hidden className="px-[0.25em]">
              ·
            </span>
          ) : null}
          {p}
        </span>
      ))}
    </p>
  )
}

/** A paper's text link; under a finger, a 44 px target. */
const LINK =
  "link pointer-coarse:my-0 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center pointer-coarse:py-0"

/** The paper's own page and its PDF, as text links (o, p). */
function PaperLinks({ paper }: { paper: InboxPaper }) {
  const links = paperLinks(paper)
  if (!links.article && !links.pdf) return null
  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-sans text-small pointer-coarse:items-center pointer-coarse:gap-x-2">
      {links.pdf ? (
        <a href={links.pdf.href} className={LINK} aria-keyshortcuts="p" {...NEW_TAB}>
          {links.pdf.local ? "PDF" : "PDF online"}
          <span className="sr-only"> (opens in a new tab)</span>
          <Kbd hint aria-hidden className="ml-1.5 h-4 min-w-4 align-[0.05em] no-underline">
            p
          </Kbd>
        </a>
      ) : null}
      {links.article ? (
        <a href={links.article} className={LINK} aria-keyshortcuts="o" {...NEW_TAB}>
          Article page
          <span className="sr-only"> (opens in a new tab)</span>
          <Kbd hint aria-hidden className="ml-1.5 h-4 min-w-4 align-[0.05em] no-underline">
            o
          </Kbd>
        </a>
      ) : null}
    </p>
  )
}

/**
 * The triage summary (in the library's language, `guessLang` telling it for the typesetting), or
 * what stands for it: a paper the prior gated (never read by Haiku), a paper not triaged yet.
 */
function Summary({ paper }: { paper: InboxPaper }) {
  const t = paper.triage
  const lang = guessLang(t.summary)
  const note = (children: ReactNode) => (
    <p className="max-w-measure font-serif text-note text-pretty text-muted-foreground italic">
      {children}
    </p>
  )
  return (
    <div className="space-y-3">
      {t.by === "prior"
        ? note(
            "Never read by Haiku: the prior judged it too far from the library, so it was rated without a reading."
          )
        : null}
      {!t.summary && !t.why && t.by !== "prior"
        ? note("Not triaged yet: the next run of the inbox rates it.")
        : null}
      {t.summary ? (
        <p
          id={PANE_SUMMARY_ID}
          lang={lang}
          className="max-w-measure font-serif text-read text-pretty hyphens-auto text-foreground [font-variant-numeric:oldstyle-nums_proportional-nums]"
        >
          <Typeset text={t.summary} lang={lang} acronyms />
        </p>
      ) : null}
    </div>
  )
}

/**
 * The margin: why the triage put it here, the library's articles it cites, the prior when it points
 * elsewhere than the triage's bibliography, the kind. (Where it was found is in the details.)
 */
function Gloss({ paper }: { paper: InboxPaper }) {
  const lib = useLibrary()
  const bibName = useBibName()
  const from = useFromHere()
  const t = paper.triage
  const whyLang = guessLang(t.why)
  const cites = citesOf(paper.queries, lib.bibNames)
  const find = (bib: string | null, key: string) =>
    (bib ? lib.article(bib, key) : undefined) ??
    (t.bib ? lib.article(t.bib, key) : undefined) ??
    lib.articles.find((e) => e.article.key === key)
  // The prior says something only when it is closer to another bibliography than the triage's.
  const prior = paper.prior && paper.prior.bib !== t.bib ? paper.prior : null
  return (
    <div className="space-y-3">
      {t.why ? (
        <p
          lang={whyLang}
          className="font-serif text-note text-pretty hyphens-auto text-muted-foreground italic"
        >
          <Typeset text={t.why} lang={whyLang} />
        </p>
      ) : null}
      {cites.refs.length ? (
        // A line a little taller than a gloss's: links on two lines keep 24 px apart (WCAG 2.5.8).
        <p className="gloss leading-[1.625rem]">
          Cites {cites.more ? "at least " : ""}
          {formatCount(cites.refs.length, "of your articles", "of your articles")}:{" "}
          {cites.refs.map(({ bib, key }, i) => {
            const entry = find(bib, key)
            const parts = entry ? referenceParts(entry.article) : null
            const last = i === cites.refs.length - 1
            // Each cite whole on its line, its separator after it (a line never starts with "·").
            return (
              <span key={key}>
                <span className="whitespace-nowrap">
                  {entry && parts ? (
                    <Link
                      href={routes.article(entry.bib.name, entry.article.key, undefined, { from })}
                      className="link text-foreground"
                      title={`${entry.article.title} (${bibName(entry.bib.name)})`}
                    >
                      {parts.names[0] ? `${parts.names[0]} ${parts.year}`.trim() : parts.lead}
                    </Link>
                  ) : (
                    <span className="font-mono text-kbd">{key}</span>
                  )}
                  {last ? null : <span aria-hidden>{"\u00a0·"}</span>}
                </span>
                {last ? null : <span className="sr-only">,</span>}
                {last ? null : " "}
              </span>
            )
          })}
          {cites.more ? " …" : null}
        </p>
      ) : null}
      {prior ? (
        <p className="gloss">
          <PriorNote prior={prior} bibLabel={bibName(prior.bib) ?? undefined} />
        </p>
      ) : null}
      {t.kind ? <p className="gloss">{kindLabel(t.kind)}</p> : null}
    </div>
  )
}

/** The abstract, six lines until Enter (or its button) shows it whole. */
function Abstract({
  paper,
  expanded,
  onToggle,
}: {
  paper: InboxPaper
  expanded: boolean
  onToggle: () => void
}) {
  const [cut, setCut] = useState(false)
  if (!paper.abstract) return null
  const lang = guessLang(paper.abstract)
  const id = `${PANE_ID}-abstract`
  return (
    <section aria-labelledby={`${id}-label`} className="mt-6">
      <h3 id={`${id}-label`} className="mb-1 label font-normal">
        Abstract
      </h3>
      <p
        id={id}
        lang={lang ?? "en"}
        ref={(el) => {
          if (!el) return
          // Whether six lines cut it (it may fit): measured, and again as the pane resizes.
          const measure = () => setCut(el.scrollHeight > el.clientHeight + 1)
          const observer = new ResizeObserver(measure)
          observer.observe(el)
          return () => observer.disconnect()
        }}
        className={cn(
          "max-w-measure font-serif text-note text-pretty hyphens-auto whitespace-pre-line text-foreground [font-variant-numeric:oldstyle-nums_proportional-nums]",
          !expanded && "clamp-fade-6"
        )}
      >
        <Typeset text={withoutHeading(paper.abstract)} lang={lang} acronyms />
      </p>
      {cut || expanded ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1 text-muted-foreground"
          aria-expanded={expanded}
          aria-controls={id}
          aria-keyshortcuts="Enter"
          onClick={onToggle}
        >
          {expanded ? "Less of the abstract" : "The whole abstract"}
          <Kbd hint aria-hidden className="ml-1 no-underline">
            ↵
          </Kbd>
        </Button>
      ) : null}
    </section>
  )
}

/** An abstract as the databases give it often starts with its own heading ("Abstract", "Summary"). */
function withoutHeading(text: string): string {
  return text.replace(/^\s*(?:abstract|summary)\b[\s.:—–-]*(?=\p{Lu})/iu, "")
}

/** Where it was found, by which queries, its identifiers, the commands that decide it from a terminal. */
function Details({ paper }: { paper: InboxPaper }) {
  const lib = useLibrary()
  const bibName = useBibName()
  const doi = doiHref(paper.doi)
  const queries = paper.queries.map((q) => parseQuery(q, lib.bibNames))
  return (
    <details className="group/details mt-8 border-t border-border pt-3">
      <summary className="w-fit cursor-pointer rounded-[2px] label font-normal marker:text-muted-foreground hover:text-foreground">
        Details
      </summary>
      <dl className="mt-3 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 font-sans text-ui">
        <Fact label="Found">
          {paper.found ? (
            <time dateTime={paper.found}>{formatDate(paper.found.slice(0, 10))}</time>
          ) : (
            "On an unknown day"
          )}
          {paper.sources.length ? `, by ${sourceList(paper.sources)}` : null}
        </Fact>
        {queries.length ? (
          <Fact label={queries.length === 1 ? "Query" : "Queries"}>
            <ul className="space-y-0.5">
              {queries.map((q, i) => (
                <li key={i}>
                  {q.cites ? (
                    <>
                      cites{" "}
                      {q.cites.keys.map((k, i) => (
                        <span key={k}>
                          {i > 0 ? ", " : null}
                          <span className="font-mono text-kbd">{k}</span>
                        </span>
                      ))}
                      {q.cites.more ? " …" : null}
                    </>
                  ) : (
                    <>“{q.text}”</>
                  )}
                  {q.bib ? (
                    <span className="text-muted-foreground"> · {bibName(q.bib)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Fact>
        ) : null}
        <Fact label="Identifiers">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {doi ? (
              <a href={doi} className="break-all link" {...NEW_TAB}>
                doi:{paper.doi}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
            <span className="font-mono text-kbd break-all text-muted-foreground">{paper.id}</span>
          </span>
        </Fact>
        <Fact label="In a terminal">
          <span className="flex flex-wrap gap-1.5">
            <CliCommand command={commands.inboxAccept(paper.id)} />
            <CliCommand command={commands.inboxReject(paper.id)} />
          </span>
        </Fact>
      </dl>
    </details>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="label">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}

// ---------------------------------------------------------------------------- the decision bar

/**
 * Reject r and Accept a → its bibliography: two quiet buttons of one size, Accept underlined in
 * rubric; what the paper's state is on the left (its place in the list, or "Rejected · Undo").
 */
function DecisionBar({
  row,
  position,
  api,
  onDecide,
  onUndo,
  layout,
  statusLine,
  keys,
  failure,
}: {
  row: InboxRow
  position: { n: number; of: number } | null
  api: ApiState
  onDecide: (id: string, decision: Decision) => void
  onUndo: () => void
  layout: "pane" | "page"
  statusLine?: ReactNode
  keys: boolean
  failure: FailedDecision | null
}) {
  const bibName = useBibName()
  const { paper, status, pending, queued } = row
  const target = paper.triage.bib && paper.triage.bib !== "none" ? bibName(paper.triage.bib) : null
  const canAccept = status !== "accepted" && status !== "added"
  const canReject = status !== "rejected"
  const page = layout === "page"
  const click = (decision: Decision) => (e: MouseEvent) => {
    // A double click's second click would decide the next paper, now in this one's place.
    if (e.detail > 1) return
    onDecide(paper.id, decision)
  }

  let state: ReactNode = null
  if (pending)
    state = (
      <span className="inline-flex items-center gap-1.5">
        <Spinner className="size-3.5" aria-hidden />
        {status === "accepted" ? "Accepting…" : "Rejecting…"}
      </span>
    )
  else if (status === "accepted")
    state = row.decided ? (
      <>
        <span className="text-success">Accepted</span>
        {queued ? <UndoLink onUndo={onUndo} /> : null}
      </>
    ) : (
      <>
        <span className="text-success">Accepted</span>, waiting for{" "}
        <code className="font-mono text-kbd">{commands.addAccepted}</code>
      </>
    )
  else if (status === "rejected" || status === "added")
    state = (
      <>
        {status === "rejected" ? "Rejected" : "Added to its bibliography"}
        {queued ? <UndoLink onUndo={onUndo} /> : null}
      </>
    )
  else if (failure)
    state = (
      <span className="text-danger">
        {failure.decision === "accept" ? "Accept" : "Reject"} not saved: {failure.reason}
      </span>
    )
  else if (position && !page)
    state = (
      <span className="num">
        {position.n} of {position.of}
      </span>
    )

  const bar = cn(
    "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-background",
    page ? "py-2" : "sticky bottom-0 z-10 py-3"
  )
  // The page layout's bar sticks to the bottom of the screen (above a phone's tab bar), with the
  // status line just above its buttons.
  const frame = (children: ReactNode) =>
    page ? (
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 bg-background px-4 md:bottom-0 md:-mx-8 md:px-8">
        {statusLine}
        {children}
      </div>
    ) : (
      children
    )

  if (api === "unavailable") {
    return frame(
      <div role="group" aria-label="Decide in a terminal" className={bar}>
        <span className="text-small text-muted-foreground">In a terminal:</span>
        {canAccept ? <CliCommand command={commands.inboxAccept(paper.id)} /> : null}
        {canReject ? <CliCommand command={commands.inboxReject(paper.id)} /> : null}
      </div>
    )
  }

  const button = cn(
    "min-w-0 justify-center gap-2",
    page && "h-12 text-note max-sm:flex-wrap max-sm:content-center max-sm:gap-y-0"
  )
  return frame(
    <div role="group" aria-label="Decision" className={bar}>
      {state ? (
        <p className={cn("mr-auto font-sans text-small text-muted-foreground", page && "w-full")}>
          {state}
        </p>
      ) : page ? null : (
        <span className="mr-auto" />
      )}
      <div
        className={cn(
          "grid gap-3",
          canReject && canAccept ? "grid-cols-2" : "grid-cols-1",
          page ? "w-full" : "w-[min(26rem,100%)]"
        )}
      >
        {canReject ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            aria-keyshortcuts={keys ? "r" : undefined}
            aria-label={`Reject “${paper.title}”`}
            onClick={click("reject")}
            className={button}
          >
            Reject
            {keys ? (
              <Kbd hint aria-hidden>
                r
              </Kbd>
            ) : null}
          </Button>
        ) : null}
        {canAccept ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            aria-keyshortcuts={keys ? "a" : undefined}
            aria-label={`Accept “${paper.title}”${target ? ` into ${target}` : ""}`}
            onClick={click("accept")}
            className={button}
          >
            <span className="underline decoration-[color-mix(in_oklab,var(--rubric)_70%,transparent)] decoration-1 underline-offset-[0.22em] group-hover/button:decoration-rubric">
              Accept
            </span>
            {keys ? (
              <Kbd hint aria-hidden>
                a
              </Kbd>
            ) : null}
            {target ? (
              <span
                className={cn(
                  "min-w-0 truncate font-normal text-muted-foreground",
                  // A phone's half-width button: the bibliography on a line of its own.
                  page && "max-sm:basis-full max-sm:text-center max-sm:text-small max-sm:leading-4"
                )}
              >
                → {target}
              </span>
            ) : null}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function UndoLink({ onUndo }: { onUndo: () => void }) {
  return (
    <>
      <span aria-hidden className="px-[0.25em]">
        ·
      </span>
      <button
        type="button"
        onClick={onUndo}
        aria-keyshortcuts="u"
        className="rounded-[2px] font-medium link text-foreground"
      >
        Undo
        <Kbd hint aria-hidden className="ml-1 h-4 min-w-4 no-underline">
          u
        </Kbd>
      </button>
    </>
  )
}
