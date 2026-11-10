/**
 * Instant client-side search over the articles' cards (MiniSearch): title, citation, authors, venue,
 * tags, one line, key, year. For the ⌘K palette, filters and quick lookups; the full text of the
 * papers is searched by the server (`searchPassages` in lib/api.ts).
 *
 * Built once per loaded library (memoized), accent- and case-insensitive, prefix and light fuzzy
 * matching, every word required.
 */
import MiniSearch, { type SearchResult } from "minisearch"

import type { ArticleEntry, LibraryIndex } from "./model"
import { foldText } from "./text"

interface ArticleDoc {
  id: string
  title: string
  cite: string
  authors: string
  venue: string
  tags: string
  one_line: string
  key: string
  year: string
}

const FIELDS = ["title", "cite", "authors", "venue", "tags", "one_line", "key", "year"] as const

const indexes = new WeakMap<LibraryIndex, MiniSearch<ArticleDoc>>()

/** Words: runs of letters and digits, keeping codes like "s12", "pm2.5", "1d-cnn" whole. */
function tokenize(text: string): string[] {
  return foldText(text).match(/[\p{L}\p{N}]+(?:[-.][\p{L}\p{N}]+)*/gu) ?? []
}

function articleIndex(lib: LibraryIndex): MiniSearch<ArticleDoc> {
  let index = indexes.get(lib)
  if (index) return index
  index = new MiniSearch<ArticleDoc>({
    fields: [...FIELDS],
    tokenize,
    processTerm: (term) => term,
    searchOptions: {
      boost: { title: 3, cite: 3, key: 2, authors: 2, tags: 1.5 },
      prefix: true,
      fuzzy: (term) => (term.length > 4 ? 0.15 : false),
      combineWith: "AND",
    },
  })
  index.addAll(
    lib.articles.map(({ ref, article: a }) => ({
      id: ref,
      title: a.title,
      cite: a.cite,
      authors: a.authors,
      venue: a.venue,
      tags: a.tags.join(" "),
      one_line: a.one_line,
      key: a.key,
      year: a.year === null ? "" : String(a.year),
    }))
  )
  indexes.set(lib, index)
  return index
}

export interface ArticleMatch {
  entry: ArticleEntry
  score: number
  /** The query words matched, as found in the text (folded), for highlighting. */
  terms: string[]
}

export interface ArticleSearchOptions {
  /** Only this bibliography's articles. */
  bib?: string
  limit?: number
}

/** The articles matching every word of `query`, best first. */
export function searchArticles(
  lib: LibraryIndex,
  query: string,
  opts: ArticleSearchOptions = {}
): ArticleMatch[] {
  if (!query.trim()) return []
  const results: SearchResult[] = articleIndex(lib).search(query, {
    filter: opts.bib ? (r) => String(r.id).startsWith(`${opts.bib}/`) : undefined,
  })
  const out: ArticleMatch[] = []
  for (const r of results) {
    const [bib, ...rest] = String(r.id).split("/")
    const entry = bib ? lib.article(bib, rest.join("/")) : undefined
    if (entry) out.push({ entry, score: r.score, terms: r.terms })
    if (opts.limit && out.length >= opts.limit) break
  }
  return out
}
