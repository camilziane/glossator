"use client"

import type { ReactNode } from "react"

import { doiHref, resolveHref, useLibrary, type InboxPaper, type InboxStatus } from "@/lib/data"
import { formatCount, formatNumber, formatShortDate, shortVenue } from "@/lib/format"
import type { Decision } from "@/lib/inbox-decisions"
import { cn } from "@/lib/utils"

import { foundAgo, kindWord } from "./inbox-model"

export const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const

/** A paper's links: its page, and a PDF (this computer's copy first). Only safe hrefs survive. */
export function paperLinks(paper: InboxPaper): {
  article: string | null
  pdf: { href: string; local: boolean } | null
} {
  const page = resolveHref(paper.url)
  const article = page?.kind === "external" ? page.href : doiHref(paper.doi)
  const local = paper.pdf ? resolveHref(paper.pdf) : null
  if (local?.kind === "file") return { article, pdf: { href: local.href, local: true } }
  const online = paper.pdf_online ? resolveHref(paper.pdf_online) : null
  return {
    article,
    pdf: online?.kind === "external" ? { href: online.href, local: false } : null,
  }
}

/** The DOM id of a paper's item (ids are free text: keep them out of selectors). */
export function paperDomId(id: string): string {
  return `paper-${id.replace(/[^\w-]/g, "_")}`
}

/** A bibliography's name as the page shows it ("none": no bibliography fits). */
export function useBibName(): (name: string | null) => string | null {
  const lib = useLibrary()
  return (name) => {
    if (!name) return null
    if (name === "none") return "No bibliography fits"
    const bib = lib.bib(name)
    return bib ? bib.short || bib.title : name
  }
}

/**
 * A count in a slot of fixed width (tabular figures, as wide as `max` needs): nothing beside it
 * moves when it changes.
 */
export function Count({
  n,
  max,
  className,
}: {
  n: number
  /** The largest the count can be (its slot is that wide). */
  max: number
  className?: string
}) {
  const width = String(formatNumber(Math.max(n, max))).length
  return (
    <span
      className={cn("inline-block text-right num", className)}
      style={{ minWidth: `${width}ch` }}
    >
      {formatNumber(n)}
    </span>
  )
}

/** A decided paper's state in words: "Accepted", "Rejected", "Saving…". */
export function StatusWord({
  status,
  pending,
  className,
}: {
  status: InboxStatus
  pending: boolean
  className?: string
}) {
  if (pending)
    return (
      <span className={cn("text-muted-foreground", className)}>
        {status === "accepted" ? "Accepting…" : "Rejecting…"}
      </span>
    )
  if (status === "new") return null
  const word: Record<InboxStatus, string> = {
    new: "",
    accepted: "Accepted",
    rejected: "Rejected",
    added: "Added",
  }
  return (
    <span
      className={cn(status === "accepted" ? "text-success" : "text-muted-foreground", className)}
    >
      {word[status]}
    </span>
  )
}

/**
 * A row's one meta line: the bibliography, the kind, the venue, the date and how long ago it was
 * found (`ML methods · method · arXiv · 1 Nov · found 2 d`). Only the venue gives way when the line
 * is short: never the date before it.
 */
export function RowMeta({
  paper,
  status,
  pending,
  decided,
  compact,
  showFound,
  failure = null,
  now,
}: {
  paper: InboxPaper
  status: InboxStatus
  pending: boolean
  /** Decided this session: the state comes first. */
  decided: boolean
  /** A phone's row: the bibliography, the venue, the date and the age. */
  compact: boolean
  /** "found 2 d" (not when the view or the groups say it already). */
  showFound: boolean
  /** A decision on it that was not saved: said first, in the danger ink. */
  failure?: { decision: Decision; reason: string } | null
  now?: Date
}) {
  const bibName = useBibName()
  const t = paper.triage
  const bib = t.bib ? bibName(t.bib) : "Not triaged"
  const kind = compact ? null : kindWord(t.kind)
  const venue = paper.venue ? shortVenue(paper.venue) : null
  const date = paper.date ? formatShortDate(paper.date, now) : null
  const found = showFound ? foundAgo(paper.found, now) : null
  const parts: ReactNode[] = []
  if (failure)
    parts.push(
      <span key="failed" className="shrink-0 text-danger" title={failure.reason}>
        {failure.decision === "accept" ? "Accept" : "Reject"} not saved
        <span className="sr-only">: {failure.reason}</span>
      </span>
    )
  if (decided || pending)
    parts.push(<StatusWord key="status" status={status} pending={pending} className="shrink-0" />)
  if (bib)
    parts.push(
      <span
        key="bib"
        className={cn("shrink-0 truncate", t.bib && t.bib !== "none" && "text-foreground")}
      >
        {bib}
      </span>
    )
  if (kind)
    parts.push(
      <span key="kind" className="shrink-0">
        {kind}
      </span>
    )
  if (venue)
    parts.push(
      <span key="venue" className="truncate-fade min-w-0" title={paper.venue}>
        {venue}
      </span>
    )
  if (date)
    parts.push(
      <time key="date" dateTime={paper.date} className="shrink-0">
        {date}
      </time>
    )
  if (found)
    parts.push(
      <span key="found" className="shrink-0">
        {found}
      </span>
    )
  return (
    <p className="mt-0.5 flex min-w-0 items-baseline font-sans text-small whitespace-nowrap text-muted-foreground">
      {parts.map((part, i) => (
        <Sep key={i} first={i === 0}>
          {part}
        </Sep>
      ))}
    </p>
  )
}

function Sep({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <>
      {first ? null : (
        <span aria-hidden className="shrink-0 px-[0.25em]">
          ·
        </span>
      )}
      {children}
    </>
  )
}

/** "Sato, Okafor, Lind", "Sato, Okafor … Lind · 23 authors". */
export function authorLine(authors: readonly string[]): string {
  if (authors.length === 0) return ""
  if (authors.length <= 4) return authors.join(", ")
  return `${authors.slice(0, 2).join(", ")} … ${authors.at(-1)} · ${formatCount(authors.length, "author")}`
}
