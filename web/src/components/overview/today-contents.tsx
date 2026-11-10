"use client"

import Link from "next/link"
import { Fragment, type ReactNode } from "react"

import { CliCommand } from "@/components/content/cli-command"
import { Typeset } from "@/components/content/typeset"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { formatCount, formatNumber } from "@/lib/format"
import { routes } from "@/lib/routes"
import { commands } from "@/lib/site"
import { cn } from "@/lib/utils"

import { yearSpan, type ContentsEntry } from "./today-data"
import { TODAY_COUNT, TODAY_ROW, TODAY_TEXT } from "./today-grid"

/**
 * The bibliographies as a contents page: each name leads to its hub, its count of articles sits in
 * the right margin in tabular figures (a folio: no column head), its scope follows in full, then one
 * meta line (the years, and drafts, notices or unreadable records when there are some).
 */
export function TodayContents({
  entries,
  className,
}: {
  entries: readonly ContentsEntry[]
  className?: string
}) {
  return (
    <section aria-labelledby="today-bibs" className={cn(TODAY_ROW, className)}>
      {/* The names say what they are: no column heads ("Bibliographies … Articles") on screen. */}
      <h2 id="today-bibs" className="sr-only">
        Bibliographies
      </h2>
      {entries.length === 0 ? (
        <NoBibliography />
      ) : (
        <ul className={TODAY_ROW}>
          {entries.map((entry) => (
            <Entry key={entry.bib.name} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Entry({ entry }: { entry: ContentsEntry }) {
  const { bib, total } = entry
  return (
    <li className={cn(TODAY_ROW, "mt-7 items-baseline first:mt-0")}>
      <h3 className={cn(TODAY_TEXT, "min-w-0 title")}>
        <Link
          href={routes.bib(bib.name)}
          data-today-row={`bib:${bib.name}`}
          className="rounded-[2px] decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] decoration-1 underline-offset-[0.18em] hover:underline"
        >
          {bib.title || bib.short || bib.name}
        </Link>
      </h3>
      <p className={cn(TODAY_COUNT, "font-serif text-read leading-7 text-foreground num")}>
        {formatNumber(total)}
        <span className="sr-only"> {total === 1 ? "article" : "articles"}</span>
      </p>
      {bib.scope ? (
        <p
          className={cn(
            TODAY_TEXT,
            "mt-1 font-serif text-note text-pretty text-muted-foreground [font-variant-numeric:oldstyle-nums]"
          )}
        >
          <Typeset text={bib.scope} acronyms />
        </p>
      ) : null}
      <Meta entry={entry} />
    </li>
  )
}

/** "2009–2026 · 2 drafts · 1 retracted · 1 corrected"; a bibliography without articles says how to add one. */
function Meta({ entry }: { entry: ContentsEntry }) {
  const { bib, total, drafts, unreadable, notices } = entry
  if (total === 0) {
    return (
      <div
        className={cn(
          TODAY_TEXT,
          "mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground"
        )}
      >
        <span>No article yet. Curate a first one from its DOI:</span>
        <CliCommand command={commands.curate(bib.name)} />
      </div>
    )
  }
  const items: ReactNode[] = []
  const span = yearSpan(entry.years)
  if (span) items.push(<span className="num">{span}</span>)
  if (drafts > 0) items.push(<span className="text-warning">{formatCount(drafts, "draft")}</span>)
  for (const n of notices) {
    const words = `${formatNumber(n.count)} ${n.label}`
    items.push(
      n.only ? (
        <Link
          href={routes.article(bib.name, n.only.key)}
          aria-label={`${words}: ${n.only.cite}`}
          className={cn("link", n.serious && "text-danger")}
        >
          {words}
        </Link>
      ) : (
        <span className={cn(n.serious && "text-danger")}>{words}</span>
      )
    )
  }
  if (unreadable > 0)
    items.push(<span className="text-danger">{formatCount(unreadable, "unreadable record")}</span>)
  if (items.length === 0) return null
  return (
    <p className={cn(TODAY_TEXT, "mt-1.5 text-small text-muted-foreground")}>
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 ? " · " : null}
          {item}
        </Fragment>
      ))}
    </p>
  )
}

function NoBibliography() {
  return (
    <Empty className={cn(TODAY_TEXT, "py-2")}>
      <EmptyHeader>
        <EmptyTitle>No bibliography yet</EmptyTitle>
        <EmptyDescription>
          A bibliography is a folder of <code className="mono">library/</code> with a{" "}
          <code className="mono">biblio.json</code> (its profile, title and scope) and a{" "}
          <code className="mono">PROFILE.md</code>. Add one, curate its first articles, then write
          the data again:
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <CliCommand command={commands.build} />
      </EmptyContent>
    </Empty>
  )
}
