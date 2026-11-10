"use client"

import Link from "next/link"
import { useSyncExternalStore } from "react"

import { LibraryBoundary } from "@/components/shell/library-boundary"
import { useLibrary } from "@/lib/data"
import { formatNumber } from "@/lib/format"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

import { notFoundSuggestions, searchQueryFromPath } from "./not-found-data"
import { TODAY_GRID, TODAY_TEXT } from "./today-grid"

const noSubscription = () => () => {}

/** The address asked for (glossator serve answers any unknown path with this page); null before hydration. */
function useAskedPath(): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => window.location.pathname,
    () => null
  )
}

/**
 * The 404 page: a sentence saying what was asked, the ways on (Today, a search for the address's
 * words), then what in the library the address may have meant and the bibliographies. No box, no
 * icon: the page's words, in the measure, at the glossed grid's left edge (as Today and an article).
 */
export function NotFoundView() {
  const path = useAskedPath()
  const query = path ? searchQueryFromPath(path) : ""
  return (
    <div className={TODAY_GRID}>
      <div className={cn(TODAY_TEXT, "py-4")}>
        <h1 className="title text-foreground">Page not found</h1>
        <p className="mt-2 font-serif text-read text-pretty text-muted-foreground">
          {path ? (
            <>
              There is no page at <code className="mono break-all text-foreground">{path}</code>.
              The link may be mistyped, or what it named has moved.
            </>
          ) : (
            "There is no page at this address. The link may be mistyped, or what it named has moved."
          )}
        </p>
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-serif text-read">
          <Link href={routes.overview()} className="link">
            Back to Today
          </Link>
          <Link href={routes.search({ q: query })} className="min-w-0 link">
            {query ? (
              <span className="[overflow-wrap:anywhere]">Search for “{query}”</span>
            ) : (
              "Search the library"
            )}
          </Link>
        </p>
        {path ? (
          <LibraryBoundary fallback={null} errorDisplay="silent">
            <Suggestions path={path} />
          </LibraryBoundary>
        ) : null}
      </div>
    </div>
  )
}

function Suggestions({ path }: { path: string }) {
  const lib = useLibrary()
  const suggestions = notFoundSuggestions(path, lib)
  if (suggestions.length === 0 && lib.bibliographies.length === 0) return null
  return (
    <>
      {suggestions.length > 0 ? (
        <section aria-labelledby="not-found-suggestions" className="mt-12">
          <h2 id="not-found-suggestions" className="mb-2 label">
            Perhaps you meant
          </h2>
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="item-title text-foreground decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] decoration-1 underline-offset-[0.18em] hover:underline"
                >
                  {s.label}
                </Link>
                <p className="text-small text-muted-foreground">
                  {s.kind === "article" ? `Article in ${s.detail}` : s.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {lib.bibliographies.length > 0 ? (
        <nav aria-labelledby="not-found-bibs" className="mt-12">
          <h2 id="not-found-bibs" className="mb-2 label">
            Bibliographies
          </h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 font-serif text-read">
            {lib.bibliographies.map((bib) => (
              <li key={bib.name}>
                <Link href={routes.bib(bib.name)} className="link">
                  {bib.short || bib.title}
                </Link>{" "}
                <span className="font-sans text-ui text-muted-foreground num">
                  {formatNumber(bib.articles.length)}
                  <span className="sr-only"> articles</span>
                </span>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </>
  )
}
