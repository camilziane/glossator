/**
 * The inbox's logic, free of React: labels, the URL's state, the filters and the sort, the list as
 * the page draws it (a view's papers in groups, the papers decided this session, a linked paper), the
 * queries a paper was found by (the citations source's "cites …"), and short titles for messages.
 */
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from "nuqs"

import { foldText, type InboxPaper, type InboxStatus } from "@/lib/data"
import { formatDate, formatShortDate, relativeDay } from "@/lib/format"
import type { Overrides } from "@/lib/inbox-decisions"
import { compareInboxPapers, compareRelevance } from "@/lib/inbox-order"
import { inView, INBOX_VIEWS, type InboxView } from "@/lib/inbox-views"
import { isRelevance, RELEVANCE, relevanceLabel } from "@/lib/labels"
import { inboxViewParams } from "@/lib/url-state"

// ---------------------------------------------------------------------------- labels

export const KIND_LABELS: Record<string, string> = {
  primary: "Primary study",
  method: "Method",
  review: "Review",
  dataset: "Dataset",
  other: "Other",
}

export const SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex",
  pubmed: "PubMed",
  arxiv: "arXiv",
  biorxiv: "bioRxiv",
  medrxiv: "medRxiv",
  citations: "Citations",
}

/** Facet values standing for "nothing there" (an untriaged paper, a kind left empty). */
export const UNTRIAGED = "untriaged"
export const NO_KIND = "unknown"
export const NO_SOURCE = "unknown"
/** The triage's bibliography when none fits. */
export const NO_FIT = "none"

export function kindLabel(kind: string): string {
  if (kind === NO_KIND) return "No kind"
  return KIND_LABELS[kind] ?? capitalize(kind)
}

/** The kind as a row's meta line says it ("primary"); nothing for "other" or none. */
export function kindWord(kind: string | null): string | null {
  if (!kind || kind === "other") return null
  return kind === "primary" ? "primary" : kind.toLowerCase()
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

/** "OpenAlex and PubMed", "OpenAlex, arXiv and PubMed". */
export function sourceList(sources: readonly string[]): string {
  const names = sources.map(sourceLabel)
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

/** "Ada Lovelace, Alan Turing, Grace Hopper + 5 more": the first `max` names. */
export function shortAuthors(authors: readonly string[], max = 3): string {
  if (authors.length <= max + 1) return authors.join(", ")
  return `${authors.slice(0, max).join(", ")} + ${authors.length - max} more`
}

/**
 * A title short enough for a one-line message: cut at a word before `max` characters, with "…".
 * "Long-term drift of invented probe grids over three years" → "Long-term drift of invented probe grids…"
 */
export function shortTitle(title: string, max = 40): string {
  const t = title.trim().replace(/\s+/g, " ")
  if (t.length <= max + 8) return t
  const cut = t.slice(0, max + 1)
  const space = cut.lastIndexOf(" ")
  const head = (space > max / 2 ? cut.slice(0, space) : t.slice(0, max)).replace(
    /[\s,;:.–—-]+$/u,
    ""
  )
  return `${head}…`
}

// ---------------------------------------------------------------------------- URL state

export const SORT_KEYS = ["relevance", "found", "prior", "date", "title"] as const
export type SortKey = (typeof SORT_KEYS)[number]

/** The sort menu's items. */
export const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Most relevant",
  found: "Latest found",
  prior: "Closest to the library",
  date: "Newest published",
  title: "Title",
}

/** What the sort menu's trigger says: the order in words. */
export const SORT_PHRASES: Record<SortKey, string> = {
  relevance: "Most relevant first",
  found: "Latest found first",
  prior: "Closest first",
  date: "Newest first",
  title: "By title",
}

/**
 * /inbox/?view=&p=&q=&bib=&kind=&source=&sort=&read= (defaults stay out of the URL). `view` and `p`
 * are the app's (`@/lib/url-state`: the view, the current paper); `read` opens the current paper on
 * the whole screen (phones and tablets; Back closes it).
 */
export const inboxParams = {
  ...inboxViewParams,
  q: parseAsString.withDefault(""),
  bib: parseAsArrayOf(parseAsString).withDefault([]),
  kind: parseAsArrayOf(parseAsString).withDefault([]),
  source: parseAsArrayOf(parseAsString).withDefault([]),
  sort: parseAsStringLiteral(SORT_KEYS).withDefault("relevance"),
  read: parseAsBoolean.withDefault(false),
}

export type InboxParams = inferParserType<typeof inboxParams>

/** What narrows a view: the facets and the filter box. */
export type InboxFilters = Pick<InboxParams, "q" | "bib" | "kind" | "source">

export const NO_FILTERS: InboxFilters = { q: "", bib: [], kind: [], source: [] }

/** Whether any filter narrows the view (what "Clear filters" resets). */
export function hasActiveFilters(f: InboxFilters): boolean {
  return f.q.trim() !== "" || f.bib.length > 0 || f.kind.length > 0 || f.source.length > 0
}

/** The views in the order `v` walks them. */
export function nextView(view: InboxView): InboxView {
  return INBOX_VIEWS[(INBOX_VIEWS.indexOf(view) + 1) % INBOX_VIEWS.length]!
}

// ---------------------------------------------------------------------------- rows

/** A paper as the list shows it: its status after this session's decisions. */
export interface InboxRow {
  paper: InboxPaper
  status: InboxStatus
  /** A decision sent and not answered yet. */
  pending: boolean
  /** A decision waiting for its Undo delay. */
  queued: boolean
  /** Decided this session: its status is not the data's any more. */
  decided: boolean
  /** The decision that set it (later decisions have larger numbers); 0 when undecided. */
  batch: number
}

/** Each paper with this session's decisions. */
export function inboxRows(papers: readonly InboxPaper[], overrides: Overrides): InboxRow[] {
  return papers.map((paper) => {
    const o = overrides.get(paper.id)
    const status = o?.status ?? paper.status
    return {
      paper,
      status,
      pending: o?.phase === "sending",
      queued: o?.phase === "queued",
      decided: o !== undefined && status !== paper.status,
      batch: o?.batch ?? 0,
    }
  })
}

// ---------------------------------------------------------------------------- filters and facets

export const FACETS = ["bib", "kind", "source"] as const
export type Facet = (typeof FACETS)[number]

/** A paper's value(s) for a facet; a paper has several sources. */
export function facetValues(paper: InboxPaper, facet: Facet): string[] {
  switch (facet) {
    case "bib":
      return [paper.triage.bib || UNTRIAGED]
    case "kind":
      return [paper.triage.kind || NO_KIND]
    case "source":
      return paper.sources.length ? paper.sources : [NO_SOURCE]
  }
}

const haystacks = new WeakMap<InboxPaper, string>()

/** Everything the filter box matches, folded (accents, case), computed once per paper. */
function haystack(p: InboxPaper): string {
  let h = haystacks.get(p)
  if (h === undefined) {
    h = foldText(
      [
        p.id,
        p.title,
        p.authors.join(" "),
        p.venue,
        p.doi,
        p.triage.summary ?? "",
        p.triage.why ?? "",
        p.abstract,
        p.queries.join(" "),
      ].join("\n")
    )
    haystacks.set(p, h)
  }
  return h
}

/** Every word of the query (accents and case folded) appears somewhere in the paper. */
export function matchesQuery(paper: InboxPaper, query: string): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const h = haystack(paper)
  return words.every((w) => h.includes(w))
}

/** Whether a paper passes every filter, except `skip` (a facet's own counts ignore its choice). */
export function passes(paper: InboxPaper, f: InboxFilters, skip?: Facet): boolean {
  return (
    FACETS.every(
      (facet) =>
        facet === skip ||
        !f[facet].length ||
        facetValues(paper, facet).some((v) => f[facet].includes(v))
    ) && matchesQuery(paper, f.q)
  )
}

/** The rows passing every filter (but `skip`). */
export function filterRows<R extends { paper: InboxPaper }>(
  rows: readonly R[],
  f: InboxFilters,
  skip?: Facet
): R[] {
  return rows.filter((row) => passes(row.paper, f, skip))
}

/** How many rows each value of a facet would show, the other filters applied. */
export function facetCounts(
  rows: readonly { paper: InboxPaper }[],
  f: InboxFilters,
  facet: Facet
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of filterRows(rows, f, facet)) {
    for (const v of new Set(facetValues(row.paper, facet))) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return counts
}

/**
 * Every value a facet takes in `rows`, and the values chosen (so a choice that left the view can be
 * undone), in a stable, meaningful order.
 */
export function facetOptions(
  rows: readonly { paper: InboxPaper }[],
  facet: Facet,
  chosen: readonly string[] = []
): string[] {
  const seen = new Set<string>(chosen)
  for (const row of rows) for (const v of facetValues(row.paper, facet)) seen.add(v)
  const order: Partial<Record<Facet, readonly string[]>> = {
    kind: Object.keys(KIND_LABELS),
    source: Object.keys(SOURCE_LABELS),
  }
  const known = order[facet]
  const tail = (v: string) => (v === UNTRIAGED || v === NO_FIT || v === NO_KIND ? 1 : 0)
  return [...seen].sort((a, b) => {
    const t = tail(a) - tail(b)
    if (t) return t
    if (known) {
      const ia = known.indexOf(a)
      const ib = known.indexOf(b)
      if (ia !== ib) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)
    }
    return a.localeCompare(b)
  })
}

// ---------------------------------------------------------------------------- sorting

const desc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1)
const descText = (a: string, b: string) => (a === b ? 0 : a < b ? 1 : -1)

const COMPARE: Record<SortKey, (a: InboxPaper, b: InboxPaper) => number> = {
  relevance: compareInboxPapers,
  prior: (a, b) => desc(a.prior?.score ?? null, b.prior?.score ?? null) || compareRelevance(a, b),
  date: (a, b) => descText(a.date, b.date) || compareRelevance(a, b),
  found: (a, b) => descText(a.found.slice(0, 10), b.found.slice(0, 10)) || compareInboxPapers(a, b),
  title: (a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }),
}

/** Sorted copy; ties keep the data's order (the server's). */
export function sortRows<R extends { paper: InboxPaper }>(rows: readonly R[], sort: SortKey): R[] {
  const compare = COMPARE[sort]
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => compare(a.row.paper, b.row.paper) || a.i - b.i)
    .map(({ row }) => row)
}

// ---------------------------------------------------------------------------- groups

/** The heading of a run of rows: what the sort orders them by ("In scope", "Today", "Nov 2026"). */
export function groupOf(
  paper: InboxPaper,
  sort: SortKey,
  now: Date = new Date()
): { key: string; label: string } | null {
  switch (sort) {
    case "relevance": {
      const r = paper.triage.relevance
      return isRelevance(r)
        ? { key: `rel-${r}`, label: RELEVANCE[r].label }
        : { key: "rel-none", label: relevanceLabel(null) }
    }
    case "found": {
      const day = paper.found.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { key: "found-none", label: "Date unknown" }
      const rel = relativeDay(day, now)
      return {
        key: `found-${day}`,
        label:
          rel === "today" ? "Today" : rel === "yesterday" ? "Yesterday" : formatShortDate(day, now),
      }
    }
    case "date": {
      const month = /^(\d{4})(?:-(\d{2}))?/.exec(paper.date)
      if (!month) return { key: "date-none", label: "No date" }
      const key = month[2] ? `${month[1]}-${month[2]}` : month[1]!
      return { key: `date-${key}`, label: formatDate(key) }
    }
    default:
      return null
  }
}

/** A row as the list draws it: shown, or collapsing away (decided this session). */
export interface ListRow {
  row: InboxRow
  /** Decided this session: drawn collapsed where it was (it moved to "Decided this session"). */
  collapsed: boolean
}

export interface RowGroup {
  key: string
  /** Null when the sort makes no groups (one run of rows, no heading). */
  label: string | null
  /** The rows shown (the collapsed ones not counted). */
  count: number
  rows: ListRow[]
}

export interface InboxList {
  /** The view's papers passing the filters, sorted, in groups (decided ones collapsed in place). */
  groups: RowGroup[]
  /** The rows shown, in order (what j and k walk through, before the decided ones). */
  shown: InboxRow[]
  /** Papers decided this session, not in the view any more, the latest decision first. */
  decided: InboxRow[]
  /** A paper the URL named that is neither (a link to a rejected paper): shown above the list. */
  linked: InboxRow | null
  /** The view's papers before the filters (the facets' counts read them). */
  inView: InboxRow[]
}

export interface ListOptions {
  view: InboxView
  /** `latestRunDay(inbox)`. */
  day: string | null
  filters: InboxFilters
  sort: SortKey
  /** The paper a link opened the inbox on. */
  linked?: string | null
  now?: Date
}

/** The list the page draws, from every row (`inboxRows`). */
export function buildList(rows: readonly InboxRow[], opts: ListOptions): InboxList {
  const { view, day, filters, sort } = opts
  const now = opts.now ?? new Date()
  const current: InboxRow[] = []
  const placed: ListRow[] = []
  const decided: InboxRow[] = []
  for (const row of rows) {
    const here = inView(view, row.paper, row.status, day)
    if (here) current.push(row)
    if (!passes(row.paper, filters)) continue
    if (here) placed.push({ row, collapsed: false })
    else if (row.decided) {
      decided.push(row)
      // Where it was before this session decided it: it collapses there.
      if (inView(view, row.paper, row.paper.status, day)) placed.push({ row, collapsed: true })
    }
  }
  const groups: RowGroup[] = []
  for (const item of sortRows(
    placed.map((p) => ({ ...p, paper: p.row.paper })),
    sort
  )) {
    const g = groupOf(item.paper, sort, now) ?? { key: "all", label: null }
    let group = groups.at(-1)
    if (!group || group.key !== g.key) {
      group = { key: g.key, label: g.label, count: 0, rows: [] }
      groups.push(group)
    }
    group.rows.push({ row: item.row, collapsed: item.collapsed })
    if (!item.collapsed) group.count += 1
  }
  const shown = groups.flatMap((g) => g.rows.filter((r) => !r.collapsed).map((r) => r.row))
  decided.sort((a, b) => b.batch - a.batch)
  let linked: InboxRow | null = null
  if (opts.linked) {
    const id = opts.linked
    if (!shown.some((r) => r.paper.id === id) && !decided.some((r) => r.paper.id === id))
      linked = rows.find((r) => r.paper.id === id) ?? null
  }
  return { groups, shown, decided, linked, inView: current }
}

/** The first view that holds a paper in `status` (null: none, a rejected or added paper). */
export function viewOf(
  paper: InboxPaper,
  status: InboxStatus,
  day: string | null
): InboxView | null {
  return INBOX_VIEWS.find((v) => inView(v, paper, status, day)) ?? null
}

/** What the group of a paper named by a link but outside the view says. */
export function linkedLabel(status: InboxStatus): string {
  switch (status) {
    case "rejected":
      return "Rejected"
    case "added":
      return "Added to its bibliography"
    default:
      return "Outside this view"
  }
}

// ---------------------------------------------------------------------------- queries

/** One entry of a paper's `queries`: "<bib>: <query>", or a citing search's "<bib>: cites a, b …". */
export interface PaperQuery {
  /** The bibliography whose watch found it (null when the entry names none). */
  bib: string | null
  /** The query as written, without the bibliography. */
  text: string
  /** The library's articles it cites, for the citations source. */
  cites: { keys: string[]; more: boolean } | null
}

/**
 * The library's articles a paper found by the citations source cites: its query reads
 * "cites key1, key2 …" (the tool's scout). Null for any other query.
 */
export function citedKeys(query: string): { keys: string[]; more: boolean } | null {
  const m = /^cites\s+(.+)$/.exec(query.trim())
  if (!m) return null
  let list = m[1]!.trim()
  const more = list.endsWith("…") || list.endsWith("...")
  if (more) list = list.replace(/(?:…|\.\.\.)$/u, "").trim()
  const keys = list
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
  return keys.length ? { keys, more } : null
}

const BIB_PREFIX = /^([A-Za-z0-9][\w.-]*):\s+(.+)$/su

/**
 * Reads a query entry. The inbox writes "<bib>: <query>"; a prefix counts as a bibliography when
 * `bibs` names it (or, without `bibs`, when it looks like one: a lower-case name).
 */
export function parseQuery(entry: string, bibs?: ReadonlySet<string>): PaperQuery {
  const text = entry.trim()
  const m = BIB_PREFIX.exec(text)
  let bib: string | null = null
  let rest = text
  if (m) {
    const name = m[1]!
    const known = bibs ? bibs.has(name) : /^[a-z0-9_-]+$/.test(name)
    if (known) {
      bib = name
      rest = m[2]!.trim()
    }
  }
  return { bib, text: rest, cites: citedKeys(rest) }
}

/** The library's articles a paper cites, across its queries (each key once), and whether more. */
export function citesOf(
  queries: readonly string[],
  bibs?: ReadonlySet<string>
): { refs: { bib: string | null; key: string }[]; more: boolean } {
  const refs: { bib: string | null; key: string }[] = []
  const seen = new Set<string>()
  let more = false
  for (const q of queries) {
    const { bib, cites } = parseQuery(q, bibs)
    if (!cites) continue
    more ||= cites.more
    for (const key of cites.keys) {
      if (seen.has(key)) continue
      seen.add(key)
      refs.push({ bib, key })
    }
  }
  return { refs, more }
}

// ---------------------------------------------------------------------------- the daily run

/**
 * When the daily search last ran, as the inbox wrote it (its own clock): "today at 07:30",
 * "yesterday at 07:30", "on 5 Nov at 07:30"; null when it never ran.
 */
export function ranWords(lastRun: string, now: Date = new Date()): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(lastRun.trim())
  if (!m) return null
  const day = m[1]!
  const rel = relativeDay(day, now)
  const when = rel ?? `on ${formatShortDate(day, now)}`
  return m[2] ? `${when} at ${m[2]}:${m[3]}` : when
}

// ---------------------------------------------------------------------------- the hook

/** Clauses of a summary: sentences, then their parts at ";", ":" and ", " outside parentheses. */
function clauses(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  const t = text.replace(/\s+/g, " ").trim()
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (c === "(" || c === "[") depth += 1
    else if ((c === ")" || c === "]") && depth > 0) depth -= 1
    else if (depth === 0) {
      const next = t[i + 1]
      const end =
        ((c === ";" || c === ":" || c === "," || c === "." || c === "!" || c === "?") &&
          (next === " " || next === undefined)) ||
        false
      // "0.05" and "11,37" have no space after their mark: they stay whole.
      if (end) {
        out.push(t.slice(start, i))
        start = i + 1
      }
    }
  }
  out.push(t.slice(start))
  return out.map((s) => s.replace(/^[\s  ]+|[\s  ]+$/g, "")).filter(Boolean)
}

/** A figure that is a result: a percentage, a decimal. */
const RESULT =
  /(?<![\p{L}\p{N}_-])\d+(?:[.,]\d+)?[\s  ]?(?:%|‰)|(?<![\p{L}\p{N}_.,-])\d+[.,]\d+(?![\p{L}\d])/u
/** A figure with what it counts or compares: ×, a unit, a comparison. */
const MEASURE =
  /(?<![\p{L}\p{N}_-])\d+(?:[.,]\d+)?[\s  ]?(?:×|x(?=\s)|ms\b|s\b|min\b|h\b|Hz|kHz|dB|µV|mV|mm|cm)|[<>≤≥≈±][\s  ]?\d/u
/** Any figure standing alone (not S12, not ResNet50, not a year). */
const FIGURE = /(?<![\p{L}\p{N}_.,/-])(?!(?:19|20)\d\d(?!\d))\d+(?:[\s  ]\d{3})*(?![\p{L}\d])/u

const HOOK_MAX = 110

/**
 * The hook of a paper for its row: the first clause of the triage's summary that carries a number,
 * a result first (a percentage, a decimal), else a measure (×, a unit), else any figure. Long
 * clauses are cut around the figure at word boundaries with "…". Null when no clause has one.
 */
export function hookOf(summary: string | null | undefined): string | null {
  if (!summary) return null
  const parts = clauses(summary)
  for (const re of [RESULT, MEASURE, FIGURE]) {
    for (const part of parts) {
      const m = re.exec(part)
      if (!m) continue
      if (part.length <= HOOK_MAX) return part
      const at = m.index
      let from = Math.max(0, at - 45)
      let to = Math.min(part.length, at + m[0].length + 55)
      if (from > 0) from = part.indexOf(" ", from) + 1 || from
      if (to < part.length) {
        const space = part.lastIndexOf(" ", to)
        if (space > at + m[0].length) to = space
      }
      return `${from > 0 ? "…" : ""}${part.slice(from, to).trim()}${to < part.length ? "…" : ""}`
    }
  }
  return null
}

/** How long ago a paper was found, for a row: "found today", "found 2 d", "found 3 wk", "found 5 Nov". */
export function foundAgo(found: string, now: Date = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(found)
  if (!m) return null
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today - day) / 86_400_000)
  if (days <= 0) return "found today"
  if (days < 14) return `found ${days} d`
  if (days < 60) return `found ${Math.floor(days / 7)} wk`
  return `found ${formatShortDate(found.slice(0, 10), now)}`
}
