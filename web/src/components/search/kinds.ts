/**
 * What a search match is, as a reader sorts it: the article's author or title, a section of its
 * summary, a page of the paper, a work the paper cites, a supplementary file, a referee report, the
 * summary's curation notes. Each kind has its identity (`@/lib/identity`): the results mark their
 * lines with it, and the filters above them name the kinds the results hold.
 */
import type { SearchHit } from "@/lib/api"
import { foldText, recordField, type Article, type ArticleEntry } from "@/lib/data"
import { formatNumber } from "@/lib/format"
import { APP, sectionIdentity, type Identity } from "@/lib/identity"

import { matchRanges } from "./highlight"
import type { HitGroup, HitPlace } from "./hits"

export interface MatchKind {
  /** "author", "title", "reference", "paper", "cites", "supplementary", "review", "curation", or "section:<id>". */
  key: string
  label: string
  identity: Identity | null
}

export const KINDS = {
  author: { key: "author", label: "Author", identity: APP.author },
  title: { key: "title", label: "Title", identity: APP.title },
  reference: { key: "reference", label: "Reference", identity: APP.journal },
  paper: { key: "paper", label: "Paper text", identity: APP.paper },
  cites: { key: "cites", label: "Cites", identity: APP.cites },
  supplementary: { key: "supplementary", label: "Supplementary", identity: APP.supplementary },
  review: { key: "review", label: "Peer review", identity: APP.review },
  curation: { key: "curation", label: "Curation notes", identity: APP.curation },
} as const satisfies Record<string, MatchKind>

/** The filters' order: the reference, the summary's sections, the files, the notes last. */
const ORDER = [
  "author",
  "title",
  "reference",
  "section",
  "paper",
  "cites",
  "supplementary",
  "review",
]

function rank(key: string): number {
  if (key === "curation") return ORDER.length
  const at = ORDER.indexOf(key.startsWith("section:") ? "section" : key)
  return at < 0 ? ORDER.length - 1 : at
}

/** Fields of a summary that say how it was made (its curation, its copy of the paper): notes. */
const NOTE_FIELDS = new Set(["curation", "paper", "supplementary"])

/** The article's authors, every one ("Given Family") when the card lists them, else its short line. */
export function authorsOf(article: Pick<Article, "authors" | "authors_full">): string[] {
  const full = article.authors_full ?? []
  if (full.length > 0) return full
  return article.authors
    .replace(/\s*\(\d+\s+authors?\)\s*$/u, "")
    .split(/\s*,\s*/u)
    .map((n) => n.trim())
    .filter((n) => n && n !== "…" && n !== "...")
}

export interface AuthorMatch {
  /** The author's place in the list, from 0. */
  index: number
  /** How many authors the list holds (the card's count when it is cut). */
  total: number
  name: string
}

/**
 * The first author a query names, word for word ("lindqvist", "ingrid lindqvist"): its place in the
 * list and the list's length; null when the query names none of them.
 */
export function authorMatch(
  article: Pick<Article, "authors" | "authors_full">,
  terms: readonly string[]
): AuthorMatch | null {
  const names = authorsOf(article)
  if (terms.length === 0) return null
  const count = /\((\d+)\s+authors?\)\s*$/u.exec(article.authors)
  const total = (article.authors_full?.length ?? 0) || Number(count?.[1] ?? names.length)
  for (const [index, name] of names.entries()) {
    const words = ` ${foldText(name).replace(/[^\p{L}\p{N}]+/gu, " ")} `
    if (terms.some((t) => words.includes(` ${foldText(t).trim()} `))) return { index, total, name }
  }
  return null
}

const ORDINALS = ["1st", "2nd", "3rd"]

/** "1st of 17", "8th of 10", "last of 6", "sole author". */
export function authorPlace({ index, total }: AuthorMatch): string {
  if (total <= 1) return "sole author"
  if (index === total - 1 && total > 2) return `last of ${formatNumber(total)}`
  const nth = ORDINALS[index] ?? `${formatNumber(index + 1)}th`
  return `${nth} of ${formatNumber(total)}`
}

/** Whether a text names one of the terms (a word of the title, a phrase). */
function names(text: string, terms: readonly string[]): boolean {
  return matchRanges(text, terms).length > 0
}

// A name as a citation writes it, after the matched word: "Lindqvist, M.", "Lindqvist M",
// "Lindqvist et al.", "Lindqvist 2021", "Lindqvist (2021)", "Lindqvist, 2021".
const CITED_AFTER =
  /^(?:\s*,\s*\p{Lu}\.|\s+\p{Lu}{1,2}\b|\s+et al\b|,?\s*\(?(?:19|20)\d{2}[a-z]?\b)/u
// …or before it, in a list of names: "M. Lindqvist,", "Ingrid Lindqvist,", "Ingrid A. Lindqvist;".
const INITIALS_BEFORE = /(?:^|[\s,;([])\p{Lu}\.\s?(?:\p{Lu}\.\s?)?$/u
const GIVEN_BEFORE = /(?:^|[\s,;([\]])\p{Lu}\p{Ll}+(?:\s\p{Lu}\.)?\s$/u
const LISTED_AFTER = /^\s*[,;]/u

/**
 * Whether a passage of a paper cites the query as an author: the matched word written as a name
 * (capitalised) beside initials, "et al." or a year, or as a full name in a list of authors. A
 * reference list or an in-text citation, not the paper's own words.
 */
export function citesTerm(snippet: string, terms: readonly string[]): boolean {
  for (const range of matchRanges(snippet, terms)) {
    const word = snippet.slice(range.start, range.end)
    if (!/^\p{Lu}/u.test(word)) continue
    const before = snippet.slice(Math.max(0, range.start - 24), range.start)
    const after = snippet.slice(range.end, range.end + 24)
    if (CITED_AFTER.test(after)) return true
    if (LISTED_AFTER.test(after) && (INITIALS_BEFORE.test(before) || GIVEN_BEFORE.test(before)))
      return true
  }
  return false
}

/** The kind of a match, from where it is (`hitPlace`), its words and the article's card. */
export function kindOf(
  hit: SearchHit,
  place: HitPlace,
  entry: ArticleEntry | undefined,
  terms: readonly string[]
): MatchKind {
  const field = recordField(hit.source)
  if (field === "bib") {
    if (entry && authorMatch(entry.article, terms)) return KINDS.author
    if (entry && names(entry.article.title, terms)) return KINDS.title
    return KINDS.reference
  }
  if (field !== null && NOTE_FIELDS.has(field)) return KINDS.curation
  if (field !== null) {
    const id = field.replaceAll("_", "-")
    return {
      key: `section:${id}`,
      label: place.section ?? id,
      identity: entry ? sectionIdentity(entry.bib.identities, id) : null,
    }
  }
  if (place.review) return KINDS.review
  if (citesTerm(hit.snippet, terms)) return KINDS.cites
  return place.kind === "paper" ? KINDS.paper : KINDS.supplementary
}

/** A passage of the results with its kind. */
export interface KindedHit {
  hit: SearchHit
  kind: MatchKind
}

/** An article of the results: its passages with their kinds, and the author the query names. */
export interface KindedGroup extends HitGroup {
  author: AuthorMatch | null
  lines: KindedHit[]
}

/**
 * The results sorted by kind. An article the query names as an author says so once: the matches
 * that only list its authors (its reference, its title page) fold into that line.
 */
export function kindGroups(
  groups: readonly HitGroup[],
  places: ReadonlyMap<string, HitPlace>,
  terms: readonly string[]
): KindedGroup[] {
  return groups.map((group) => {
    const author = group.entry ? authorMatch(group.entry.article, terms) : null
    const lines: KindedHit[] = []
    for (const hit of group.hits) {
      const place = places.get(hit.ref)
      if (!place) continue
      const kind = kindOf(hit, place, group.entry, terms)
      // An author's own article: its title page lists the authors, nothing more.
      if (author && kind.key === "cites" && (hit.page ?? 0) <= 1) continue
      lines.push({ hit, kind })
    }
    return { ...group, author, lines }
  })
}

/** Whether an article of the results holds a kind ("all": anything but curation notes). */
export function holds(group: KindedGroup, kind: string): boolean {
  if (kind === "author") return group.author !== null
  if (kind === "all")
    return group.author !== null || group.lines.some((l) => l.kind.key !== "curation")
  return group.lines.some((l) => l.kind.key === kind)
}

/** The passages of an article shown under a kind ("all": every one but curation notes). */
export function linesOf(group: KindedGroup, kind: string): KindedHit[] {
  if (kind === "all") return group.lines.filter((l) => l.kind.key !== "curation")
  if (kind === "author") return group.lines.filter((l) => l.kind.key === "author")
  return group.lines.filter((l) => l.kind.key === kind)
}

export interface KindCount {
  kind: MatchKind
  /** The articles that hold it. */
  articles: number
}

/** The kinds the results hold, in the filters' order, each with its count of articles. */
export function kindCounts(groups: readonly KindedGroup[]): KindCount[] {
  const found = new Map<string, KindCount>()
  for (const group of groups) {
    const keys = new Set(group.lines.map((l) => l.kind.key))
    if (group.author) keys.add("author")
    for (const key of keys) {
      const kind =
        key === "author" ? KINDS.author : group.lines.find((l) => l.kind.key === key)!.kind
      const count = found.get(key)
      if (count) count.articles += 1
      else found.set(key, { kind, articles: 1 })
    }
  }
  return [...found.values()].sort((a, b) => rank(a.kind.key) - rank(b.kind.key))
}
