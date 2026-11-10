/**
 * What the ⌘K palette searches besides the articles (lib/data/article-search.ts): the inbox's papers
 * (MiniSearch, built once per library, accent-insensitive, prefix and light fuzzy), the
 * bibliographies and the palette's own commands (a handful: plain word matching).
 */
import MiniSearch from "minisearch"

import {
  foldText,
  searchArticles,
  type ArticleMatch,
  type Bibliography,
  type InboxPaper,
  type LibraryIndex,
} from "@/lib/data"

/** Words of a text, folded, keeping codes like "s12" or "1d-cnn" whole (as the article index does). */
export function tokenize(text: string): string[] {
  return foldText(text).match(/[\p{L}\p{N}]+(?:[-.][\p{L}\p{N}]+)*/gu) ?? []
}

interface InboxDoc {
  id: string
  title: string
  authors: string
  venue: string
  kind: string
  year: string
}

const inboxIndexes = new WeakMap<LibraryIndex, MiniSearch<InboxDoc>>()

function inboxIndex(lib: LibraryIndex): MiniSearch<InboxDoc> {
  let index = inboxIndexes.get(lib)
  if (index) return index
  index = new MiniSearch<InboxDoc>({
    fields: ["title", "authors", "venue", "kind", "id", "year"],
    tokenize,
    processTerm: (term) => term,
    searchOptions: {
      boost: { title: 3, authors: 2, id: 2 },
      prefix: true,
      fuzzy: (term) => (term.length > 4 ? 0.15 : false),
      combineWith: "AND",
    },
  })
  index.addAll(
    (lib.inbox?.papers ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      authors: p.authors.join(", "),
      venue: p.venue,
      kind: p.triage.kind ?? "",
      year: p.date.slice(0, 4),
    }))
  )
  inboxIndexes.set(lib, index)
  return index
}

export interface InboxMatch {
  paper: InboxPaper
  score: number
  /** The words matched, folded as indexed: for highlighting. */
  terms: string[]
}

/** The inbox papers matching every word of `query`, best first. */
export function searchInbox(lib: LibraryIndex, query: string, limit?: number): InboxMatch[] {
  if (!query.trim() || !lib.inbox?.papers.length) return []
  const out: InboxMatch[] = []
  for (const r of inboxIndex(lib).search(query)) {
    const paper = lib.inboxPaper(String(r.id))
    if (paper) out.push({ paper, score: r.score, terms: r.terms })
    if (limit && out.length >= limit) break
  }
  return out
}

/** "Novák et al.", "Novák & Ito", "Novák": the surnames of an author list ("Petra Novák, Kenji Ito"). */
export function shortAuthors(authors: readonly string[]): string {
  const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name
  const [first, second] = authors
  if (!first) return ""
  if (authors.length === 1) return surname(first)
  if (authors.length === 2 && second) return `${surname(first)} & ${surname(second)}`
  return `${surname(first)} et al.`
}

/** True when every word of the query starts a word of the text (both folded). */
export function matchesWords(query: string, text: string): boolean {
  const want = tokenize(query)
  if (want.length === 0) return true
  const have = tokenize(text)
  return want.every((w) => have.some((h) => h.startsWith(w)))
}

/** The bibliographies whose name, short name, title or profile has every word of the query. */
export function searchBibliographies(lib: LibraryIndex, query: string): Bibliography[] {
  if (!query.trim()) return [...lib.bibliographies]
  return lib.bibliographies.filter((b) =>
    matchesWords(query, `${b.name} ${b.short} ${b.title} ${b.profile}`)
  )
}

export interface PaletteResults {
  articles: ArticleMatch[]
  inbox: InboxMatch[]
  bibliographies: Bibliography[]
}

export const PALETTE_LIMITS = { articles: 8, inbox: 5 } as const

/** Build the palette's indexes now (the palette opened), so the first key press does not wait. */
export function warmPaletteIndexes(lib: LibraryIndex): void {
  searchArticles(lib, "a", { limit: 1 })
  inboxIndex(lib)
}

/** Everything the palette lists for a query (nothing searched for an empty one but the bibliographies). */
export function paletteResults(lib: LibraryIndex, query: string): PaletteResults {
  return {
    articles: searchArticles(lib, query, { limit: PALETTE_LIMITS.articles }),
    inbox: searchInbox(lib, query, PALETTE_LIMITS.inbox),
    bibliographies: searchBibliographies(lib, query),
  }
}
