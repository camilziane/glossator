"use client"

import Link from "next/link"
import { useId, useState, type ReactNode } from "react"

import { Typeset } from "@/components/content/typeset"
import { PageHeader } from "@/components/shell/page"
import { type Bibliography } from "@/lib/data"
import { formatCount } from "@/lib/format"
import { routes } from "@/lib/routes"

import { formatYearSpan, scopeLead, type BibStats, type NoticeLevel } from "./model"

export interface HeaderFilters {
  /** Show the articles with a notice of this weight (the Articles table, filtered). */
  notice: (level: NoticeLevel) => void
  /** Show the drafts. */
  drafts: () => void
}

/**
 * A hub's header on one line: the title, then "49 articles · 2009–2026" in muted figures (a
 * retraction, corrections, drafts and unreadable records only when there are some, each a filter
 * of the Articles), the full-text search of its papers on the right; under it the scope's first
 * sentence, the rest behind "more".
 */
export function BibHeader({
  bib,
  stats,
  filters,
}: {
  bib: Bibliography
  stats: BibStats
  filters: HeaderFilters
}) {
  const parts: ReactNode[] = [formatCount(stats.articles, "article")]
  if (stats.years) parts.push(formatYearSpan(stats.years))
  if (stats.flagged > 0) {
    parts.push(
      <MetaFilter key="flagged" tone="danger" onClick={() => filters.notice("serious")}>
        {stats.flagged} {stats.flaggedWord}
      </MetaFilter>
    )
  }
  if (stats.corrected > 0) {
    parts.push(
      <MetaFilter key="corrected" onClick={() => filters.notice("correction")}>
        {stats.corrected} corrected
      </MetaFilter>
    )
  }
  if (stats.drafts > 0) {
    parts.push(
      <MetaFilter key="drafts" tone="warning" onClick={filters.drafts}>
        {formatCount(stats.drafts, "draft")}
      </MetaFilter>
    )
  }
  if (stats.unreadable > 0) parts.push(formatCount(stats.unreadable, "unreadable record"))

  return (
    <PageHeader
      className="mb-5"
      title={bib.title}
      meta={
        <span aria-label="In numbers" role="list" className="inline">
          {parts.map((part, i) => (
            <span key={i} role="listitem">
              {i > 0 ? <span aria-hidden> · </span> : null}
              {part}
            </span>
          ))}
        </span>
      }
      description={bib.scope ? <Scope scope={bib.scope} /> : undefined}
      actions={
        stats.articles > 0 ? (
          <Link
            href={routes.search({ bib: bib.name })}
            className="text-small link text-muted-foreground hover:text-foreground max-md:hidden"
            data-print="hide"
          >
            Search the papers
          </Link>
        ) : null
      }
    />
  )
}

/** A figure of the header that filters the Articles: a quiet word, its ink when it warns. */
function MetaFilter({
  children,
  tone,
  onClick,
}: {
  children: ReactNode
  tone?: "danger" | "warning"
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        tone === "danger" ? "link text-danger" : tone === "warning" ? "link text-warning" : "link"
      }
    >
      {children}
    </button>
  )
}

/** The scope's first sentence, the rest behind "more" (all of it in print). */
function Scope({ scope }: { scope: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const { lead, more } = scopeLead(scope)
  return (
    <p id={id}>
      {open || !more ? (
        <Typeset text={scope} acronyms />
      ) : (
        <>
          <span className="print:hidden">
            <Typeset text={lead} acronyms />
          </span>
          <span className="hidden print:inline">
            <Typeset text={scope} acronyms />
          </span>
        </>
      )}
      {more ? (
        <>
          {" "}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            className="link text-foreground print:hidden"
          >
            {open ? "less" : "more"}
          </button>
        </>
      ) : null}
    </p>
  )
}
