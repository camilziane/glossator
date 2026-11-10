"use client"

import { CornerDownLeftIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { CiteLine } from "@/components/content/cite"
import { CiteMenu } from "@/components/content/cite-menu"
import { CopyButton } from "@/components/content/copy-button"
import { NoticeBadges } from "@/components/content/notice-badge"
import { InlineCommand } from "@/components/content/cli-command"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { isApiUnavailable, type SearchHit } from "@/lib/api"
import type { ArticleEntry } from "@/lib/data"
import { guessLang } from "@/lib/lang"
import { commands } from "@/lib/site"
import { cn } from "@/lib/utils"

import { passageWithCitation } from "./citing"
import { MarkedText } from "./highlight"
import type { HitPlace, MetricRow } from "./hits"
import { PagedText, sentenceCase, splitValue } from "./passage-text"
import { fieldName, parseRecordText, type RecordGroup } from "./snippet"
import { cachedPassageText, usePassageText } from "./use-passage-search"

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function TextBlock({ text, terms }: { text: string; terms: readonly string[] }) {
  return paragraphs(text).map((p, i) => (
    <p key={i}>
      <MarkedText text={p} terms={terms} grade acronyms lang={guessLang(p)} />
    </p>
  ))
}

/** The whole page, the passage itself set apart and scrolled into view. */
function PageText({
  text,
  passage,
  terms,
}: {
  text: string
  passage: string | undefined
  terms: readonly string[]
}) {
  const current = useRef<HTMLDivElement>(null)
  const at = passage ? text.indexOf(passage) : -1
  useEffect(() => {
    // Scroll the reader only (scrollIntoView would move the page too).
    const el = current.current
    const box = el?.closest<HTMLElement>("[data-reader-scroll]")
    if (!el || !box) return
    const offset = el.getBoundingClientRect().top - box.getBoundingClientRect().top
    box.scrollTop += offset - Math.max(16, (box.clientHeight - el.clientHeight) / 3)
  }, [text, at])
  if (!passage || at < 0) return <TextBlock text={text} terms={terms} />
  return (
    <>
      <TextBlock text={text.slice(0, at)} terms={terms} />
      <div
        ref={current}
        data-current-passage=""
        className="-ml-4 space-y-5 border-l-2 border-foreground/60 bg-muted py-2 pr-3 pl-[calc(1rem-2px)]"
      >
        <span className="block label">This passage</span>
        <TextBlock text={passage} terms={terms} />
      </div>
      <TextBlock text={text.slice(at + passage.length)} terms={terms} />
    </>
  )
}

/** Labels and values of a summary's passage, as the article lists its fields. */
function RecordGroups({
  groups,
  terms,
  paperHref,
}: {
  groups: RecordGroup[]
  terms: readonly string[]
  paperHref: string | null
}) {
  return (
    <div className="space-y-6">
      {groups.map((group, g) => {
        const quote = group.lines.find((l) => fieldName(l.field) === "text")
        return (
          <section key={g} aria-label={group.title ?? undefined}>
            {group.title ? <h3 className="mb-1.5 label">{group.title}</h3> : null}
            {quote ? (
              <blockquote className="mb-2 text-read text-pretty">
                “<MarkedText text={quote.value} terms={terms} grade acronyms />”
              </blockquote>
            ) : null}
            <dl className="grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
              {group.lines
                .filter((l) => l !== quote)
                .map((line, i) => (
                  <div key={i} className="contents">
                    <dt className="label sm:pt-[0.3rem]">{line.label}</dt>
                    <dd className="max-sm:mb-1.5">
                      <PagedText text={line.value} terms={terms} paperHref={paperHref} />
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        )
      })}
    </div>
  )
}

/** A metric of the summary: the article's table row, its head as the labels. */
function MetricRows({
  metric,
  terms,
  paperHref,
}: {
  metric: MetricRow
  terms: readonly string[]
  paperHref: string | null
}) {
  const [figure, rest] = splitValue(metric.value)
  const rows = [
    {
      label: "Metric",
      node: <MarkedText text={sentenceCase(metric.name)} terms={terms} grade acronyms />,
    },
    {
      label: "Value",
      node: (
        <>
          <b className="font-semibold [font-variant-numeric:lining-nums_proportional-nums]">
            <MarkedText text={figure} terms={terms} grade />
          </b>
          <MarkedText text={rest} terms={terms} grade acronyms />
        </>
      ),
    },
    { label: "Condition", text: metric.condition },
    { label: "Chance or baseline", text: metric.baseline },
    { label: "Source", text: metric.source },
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
      {rows.map((row) =>
        row.node || row.text ? (
          <div key={row.label} className="contents">
            <dt className="label sm:pt-[0.3rem]">{row.label}</dt>
            <dd className="max-sm:mb-1.5">
              {row.node ?? (
                <PagedText
                  text={row.text ?? ""}
                  terms={terms}
                  paperHref={paperHref}
                  className={cn(
                    /^not (?:reported|applicable)$/i.test(row.text ?? "") && "text-muted-foreground"
                  )}
                />
              )}
            </dd>
          </div>
        ) : null
      )}
      {metric.headline ? (
        <p className="col-span-full mt-1 text-ui text-muted-foreground">
          A headline metric of the article.
        </p>
      ) : null}
    </dl>
  )
}

function ReaderBody({
  hit,
  place,
  wholePage,
  terms,
  paperHref,
}: {
  hit: SearchHit
  place: HitPlace
  wholePage: boolean
  terms: readonly string[]
  paperHref: string | null
}) {
  const [attempt, setAttempt] = useState(0)
  // A metric is read from the article's own table; anything else from the index.
  const result = usePassageText(place.metric ? "" : hit.ref, wholePage, attempt)
  if (place.metric) {
    return <MetricRows metric={place.metric} terms={terms} paperHref={paperHref} />
  }
  if (result.state === "loading") {
    return (
      <div role="status" aria-live="polite" className="animate-skeleton-in space-y-3 pt-1.5">
        <span className="sr-only">Reading the passage…</span>
        {["100%", "94%", "100%", "86%", "100%", "62%"].map((w, i) => (
          <div key={i} className="h-2.5 rounded-[2px] bg-muted" style={{ width: w }} />
        ))}
      </div>
    )
  }
  if (result.state === "error") {
    const unavailable = isApiUnavailable(result.error)
    const message = unavailable
      ? null
      : result.error instanceof Error
        ? result.error.message
        : "The passage could not be read."
    return (
      <div role="alert" className="space-y-3">
        <p className="font-serif text-read">
          {unavailable ? (
            <>
              Reading a passage needs <InlineCommand>{commands.serve}</InlineCommand>, which is not
              answering.
            </>
          ) : (
            message
          )}
        </p>
        <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </div>
    )
  }
  if (place.kind === "record") {
    return (
      <RecordGroups groups={parseRecordText(result.text)} terms={terms} paperHref={paperHref} />
    )
  }
  return (
    <div className="space-y-5">
      {wholePage ? (
        <PageText text={result.text} passage={cachedPassageText(hit.ref)} terms={terms} />
      ) : (
        <TextBlock text={result.text} terms={terms} />
      )}
    </div>
  )
}

/** What the reader's header says the passage is: "Page 4 of the paper", "Key metrics"… */
function placeLabel(place: HitPlace): ReactNode {
  switch (place.kind) {
    case "record":
      return place.section
    case "paper":
      return place.page ? `The paper, page ${place.page.page}` : "The paper"
    default:
      return (
        <>
          {place.file?.role ?? (place.kind === "supplementary" ? "Supplementary file" : "A file")}
          {place.page ? `, page ${place.page.page}` : ""}
        </>
      )
  }
}

/**
 * A passage read whole: its article (title, citation), what it is, the actions (open the article
 * at the passage ↵, the PDF at the page p, the citation with the page c, the passage with its
 * citation y), then the passage through /api/read (a paper's passage can show its whole page), or a
 * summary's lines with their labels. Beside the results on wide screens, else in a sheet.
 */
export function PassageReader({
  hit,
  entry,
  place,
  terms,
  articleHref,
  onClose,
  titleSlot,
  className,
}: {
  hit: SearchHit
  entry: ArticleEntry | undefined
  place: HitPlace
  terms: readonly string[]
  /** The article at the passage (with `from`). */
  articleHref: string
  onClose?: () => void
  /** Wraps the title (a sheet's own title element). */
  titleSlot?: (title: ReactNode) => ReactNode
  className?: string
}) {
  const [wholePage, setWholePage] = useState(false)
  const article = entry?.article
  const pdf = place.page?.href ?? place.fileHref
  const title = (
    <span className="block title">
      <Link
        href={articleHref}
        className="decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] underline-offset-[0.18em] hover:underline"
      >
        {article?.title || hit.cite}
      </Link>
    </span>
  )
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="space-y-2 pb-4">
        {/* What the passage is, said quietly: small caps of the regular weight, not a label's. */}
        <p className="label font-normal tracking-[0.04em]">{placeLabel(place)}</p>
        {titleSlot ? titleSlot(title) : title}
        {article ? (
          <p className="flex flex-wrap items-baseline gap-x-2 font-serif text-note text-muted-foreground">
            <CiteLine card={article} />
            <NoticeBadges notices={article.notices} />
          </p>
        ) : null}
        {place.file ? (
          <p className="truncate-fade font-mono text-small text-muted-foreground">
            {place.file.name}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button asChild size="sm">
            <Link href={articleHref} aria-keyshortcuts="Enter">
              {place.sectionId ? `Open at ${place.section}` : "Open the article"}
              <Kbd hint aria-label="Enter">
                <CornerDownLeftIcon aria-hidden />
              </Kbd>
            </Link>
          </Button>
          {pdf ? (
            <Button asChild size="sm">
              <a href={pdf} target="_blank" rel="noopener noreferrer" aria-keyshortcuts="p">
                {place.page && /\.pdf/i.test(pdf) ? (
                  <>
                    PDF <span className="text-rubric">{place.page.text}</span>
                  </>
                ) : (
                  "Open the file"
                )}
                <span className="sr-only"> (new tab)</span>
                <Kbd hint>p</Kbd>
              </a>
            </Button>
          ) : null}
          {article ? <CiteMenu card={article} place={place.cite} keyHint="c" size="sm" /> : null}
          {article ? (
            <CopyButton
              size="sm"
              variant="default"
              value={() =>
                passageWithCitation(hit, place, article, {
                  selected: readerSelection(),
                  passage: cachedPassageText(hit.ref),
                })
              }
              label={
                place.kind === "record"
                  ? "Copy with citation"
                  : place.review
                    ? "Copy referee comment"
                    : "Copy quote"
              }
              what={
                place.review
                  ? "the referee's comment with its source"
                  : "the passage with its citation"
              }
              keyHint="y"
            />
          ) : null}
          {place.kind !== "record" && hit.page !== null ? (
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={wholePage}
              onClick={() => setWholePage((w) => !w)}
              className="text-muted-foreground hover:text-foreground"
            >
              {wholePage ? "Only the passage" : `All of page ${hit.page}`}
            </Button>
          ) : null}
          {onClose ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              aria-keyshortcuts="Escape"
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              Close
            </Button>
          ) : null}
        </div>
      </div>
      <div
        data-reader-scroll=""
        tabIndex={0}
        aria-label="Passage text"
        className="min-h-0 flex-1 overflow-y-auto border-t border-border pt-5 pb-8 focus-visible:-outline-offset-2"
      >
        <div
          className={cn(
            place.kind === "record" ? "max-w-[calc(var(--measure)+10rem)]" : "max-w-measure",
            "font-serif text-read text-pretty [font-variant-numeric:oldstyle-nums_proportional-nums] [&_p+p]:mt-5"
          )}
        >
          <ReaderBody
            key={`${hit.ref}:${wholePage}`}
            hit={hit}
            place={place}
            wholePage={wholePage}
            terms={terms}
            paperHref={place.paperHref}
          />
        </div>
      </div>
    </div>
  )
}

/** The words selected inside the reader, if any (copied instead of the whole passage). */
export function readerSelection(): string | undefined {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return undefined
  const node = selection.anchorNode
  const el = node instanceof Element ? node : node?.parentElement
  return el?.closest("[data-reader-scroll], [data-passage]") ? selection.toString() : undefined
}
