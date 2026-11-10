"use client"

import Link from "next/link"

import { CiteLine } from "@/components/content/cite"
import { Page } from "@/components/shell/page"
import { foldText, searchArticles, type ArticleEntry, type LibraryIndex } from "@/lib/data"
import { routes } from "@/lib/routes"
import { typeset } from "@/lib/typeset"

const SUGGESTIONS = 5

/** Edits between two short strings (keys are a dozen letters): for "did you mean". */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + cost)
    }
    row = next
  }
  return row[b.length] ?? 0
}

/**
 * The articles the reader may have meant: keys a typo away (any bibliography, this one first), then
 * the quick search's answers for the key's words ("smith2024" → Smith, 2024).
 */
export function suggestArticles(lib: LibraryIndex, bib: string, key: string): ArticleEntry[] {
  const k = foldText(key.trim())
  if (!k) return []
  const near = lib.articles
    .map((entry) => ({ entry, d: distance(k, foldText(entry.article.key)) }))
    .filter(({ d }) => d <= Math.max(2, Math.floor(k.length / 4)))
    .sort(
      (a, b) => a.d - b.d || Number(b.entry.bib.name === bib) - Number(a.entry.bib.name === bib)
    )
    .map(({ entry }) => entry)
  const words = k
    .replace(/(\d+)/g, " $1 ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
  const found = words ? searchArticles(lib, words, { limit: SUGGESTIONS }).map((m) => m.entry) : []
  const out: ArticleEntry[] = []
  for (const entry of [...near, ...found]) {
    if (!out.some((e) => e.ref === entry.ref)) out.push(entry)
  }
  return out.slice(0, SUGGESTIONS)
}

/**
 * A link that names no article: say what is missing, in a sentence; offer the articles it may have
 * meant, the bibliography it names (when there is one) and a search.
 */
export function ArticleNotFound({
  lib,
  bib,
  articleKey,
}: {
  lib: LibraryIndex
  bib: string
  articleKey: string
}) {
  const bibliography = bib ? lib.bib(bib) : undefined
  const suggestions = suggestArticles(lib, bib, articleKey)
  let description
  if (!articleKey) {
    description = <>This link names no article: it needs a bibliography and a key.</>
  } else if (bib && !bibliography) {
    description = (
      <>
        The library has no bibliography <code className="mono">{bib}</code>, so no article{" "}
        <code className="mono">{articleKey}</code> in it.
      </>
    )
  } else {
    description = (
      <>
        {bibliography ? bibliography.title || bibliography.name : "The library"} has no article{" "}
        <code className="mono">{articleKey}</code>. It may have been renamed or removed, or the link
        mistyped.
      </>
    )
  }
  return (
    <Page width="glossed">
      <div className="max-w-measure">
        <h1 className="title">No such article</h1>
        <p className="mt-3 reading text-muted-foreground">{description}</p>
        {suggestions.length > 0 ? (
          <section aria-labelledby="did-you-mean" className="mt-8">
            <h2 id="did-you-mean" className="label">
              Did you mean
            </h2>
            <ul className="mt-2 border-t border-border">
              {suggestions.map((entry) => (
                <li key={entry.ref} className="border-b border-border">
                  <Link
                    href={routes.article(entry.bib.name, entry.article.key)}
                    className="-mx-2 block px-2 py-2.5 hover:bg-muted"
                  >
                    <span className="block font-serif text-note">
                      <CiteLine card={entry.article} />
                    </span>
                    <span className="mt-0.5 block item-title text-item">
                      {typeset(entry.article.title)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-sans text-ui">
          {bibliography ? (
            <Link href={routes.bib(bibliography.name)} className="link">
              All articles of {bibliography.short || bibliography.name}
            </Link>
          ) : (
            <Link href={routes.overview()} className="link">
              Go to Today
            </Link>
          )}
          {articleKey ? (
            <Link href={routes.search({ q: articleKey })} className="link">
              Search for “{articleKey}”
            </Link>
          ) : null}
        </p>
      </div>
    </Page>
  )
}
