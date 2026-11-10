"use client"

import Link from "next/link"
import { Fragment, useState } from "react"

import { CiteLine } from "@/components/content/cite"
import { SeriousNoticeBadge } from "@/components/content/notice-badge"
import { referenceParts } from "@/lib/cite"
import { searchArticles, type ArticleMatch, type LibraryIndex } from "@/lib/data"
import { formatCount } from "@/lib/format"
import { statusOf, useOverrides } from "@/lib/inbox-decisions"
import { guessLang } from "@/lib/lang"
import { routes } from "@/lib/routes"

import { MarkedText, matchRanges } from "./highlight"
import { searchInbox, shortAuthors } from "./palette-search"

/** The articles whose title (or citation) has the words, in the order the card search ranks them. */
export function titleMatches(
  lib: LibraryIndex,
  query: string,
  bib: string,
  exclude: ReadonlySet<string> = new Set()
): ArticleMatch[] {
  return searchArticles(lib, query, { bib: bib || undefined }).filter(
    ({ entry, terms }) =>
      !exclude.has(entry.ref) &&
      (matchRanges(entry.article.title, terms).length > 0 ||
        matchRanges(entry.article.cite, terms).length > 0)
  )
}

/** "Novak 2024": the first author's surname and the year, as a short link text. */
function shortCite(match: ArticleMatch): string {
  const { names, year } = referenceParts(match.entry.article)
  return [names[0], year].filter(Boolean).join(" ") || match.entry.article.cite
}

/**
 * One line under the passages' count: the articles whose title has the words and that no passage
 * above stands for ("Also by title: Novak 2024 · Okafor 2025 · 9 more"); "more" shows them all.
 */
export function AlsoByTitle({
  lib,
  query,
  bib,
  exclude,
  from,
  shown = 3,
}: {
  lib: LibraryIndex
  query: string
  bib: string
  /** The articles already in the results (`<bib>/<key>`). */
  exclude: ReadonlySet<string>
  from: string
  /** How many fit on the line before "n more". */
  shown?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const matches = titleMatches(lib, query, bib, exclude)
  if (matches.length === 0) return null
  const visible = expanded ? matches : matches.slice(0, shown)
  const rest = matches.length - visible.length
  return (
    <p className="px-4 pt-1 pb-3 font-sans text-ui text-muted-foreground">
      <span>Also by title:</span>{" "}
      {visible.map((m, i) => (
        <Fragment key={m.entry.ref}>
          {i > 0 ? " · " : null}
          <Link
            href={routes.article(m.entry.bib.name, m.entry.article.key, undefined, { from })}
            title={m.entry.article.title}
            className="link text-foreground"
          >
            {shortCite(m)}
          </Link>
        </Fragment>
      ))}
      {rest > 0 ? (
        <>
          {" · "}
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(true)}
            className="rounded-[2px] link"
          >
            {rest} more
          </button>
        </>
      ) : null}
    </p>
  )
}

/**
 * The articles and inbox papers whose card (title, citation, authors, tags, one line) has the
 * words, found in the browser: what the search can still show without its API, or with no passage.
 */
export function CardMatches({
  lib,
  query,
  bib,
  from,
  heading,
  quiet = false,
}: {
  lib: LibraryIndex
  query: string
  bib: string
  from: string
  /** What the list is, said before it ("By title, author or tag"). */
  heading: string
  /** Nothing at all when nothing matches. */
  quiet?: boolean
}) {
  const overrides = useOverrides()
  const articles = searchArticles(lib, query, { bib: bib || undefined })
  const inbox = bib ? [] : searchInbox(lib, query, 20)
  if (articles.length === 0 && inbox.length === 0) {
    if (quiet) return null
    return (
      <p className="max-w-measure font-serif text-note text-muted-foreground">
        No article or inbox paper has “{query}” in its title, authors or tags.
      </p>
    )
  }
  return (
    <section aria-labelledby="card-matches" className="max-w-[44rem]">
      <h2 id="card-matches" className="mb-1 label">
        {heading} ·{" "}
        <span className="num">
          {[
            articles.length ? formatCount(articles.length, "article") : "",
            inbox.length ? formatCount(inbox.length, "inbox paper") : "",
          ]
            .filter(Boolean)
            .join(", ")}
        </span>
      </h2>
      <ul className="border-t border-border">
        {articles.map(({ entry, terms }) => (
          <li key={entry.ref} className="border-b border-border">
            <Link
              href={routes.article(entry.bib.name, entry.article.key, undefined, { from })}
              className="block px-1 py-2.5 transition-colors hover:bg-muted"
              data-touch-row=""
            >
              <span className="block item-title text-item">
                <MarkedText text={entry.article.title} terms={terms} />
              </span>
              <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-serif text-gloss text-muted-foreground">
                <CiteLine card={entry.article} />
                <SeriousNoticeBadge notices={entry.article.notices} />
                <span className="ml-auto font-sans text-kbd">
                  {entry.bib.short || entry.bib.name}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {inbox.map(({ paper, terms }) => (
          <li key={paper.id} className="border-b border-border">
            <Link
              href={routes.inbox(paper.id, statusOf(paper, overrides))}
              className="block px-1 py-2.5 transition-colors hover:bg-muted"
              data-touch-row=""
            >
              <span lang={guessLang(paper.title)} className="block item-title text-item italic">
                <MarkedText text={paper.title} terms={terms} lang={guessLang(paper.title)} />
              </span>
              <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-small text-muted-foreground">
                <span>
                  {[shortAuthors(paper.authors), paper.date.slice(0, 4)].filter(Boolean).join(" ")}
                </span>
                <span className="ml-auto label">inbox</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
