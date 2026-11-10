/**
 * A bibliography's hub tables as rows the table can sort and filter: each cell keeps its inline parts
 * (drawn as is) and its plain text (sorted and searched), computed once per bibliography.
 */
import {
  foldText,
  isSeriousNotice,
  plainText,
  type Article,
  type Bibliography,
  type HubTable,
  type Inlines,
  type Notice,
} from "@/lib/data"
import { noticeLabel, seriousNotice } from "@/lib/labels"

/** How an article's notices weigh: a retraction or concern, a quiet correction, or nothing. */
export const NOTICE_LEVELS = ["serious", "correction", "none"] as const
export type NoticeLevel = (typeof NOTICE_LEVELS)[number]

export const NOTICE_LEVEL_LABELS: Record<NoticeLevel, string> = {
  serious: "Retracted or of concern",
  correction: "Corrected",
  none: "No notice",
}

/** Column ids the articles table adds to the data's own columns. */
export const EXTRA_COLUMN_IDS = ["year", "tags", "status", "notice", "search"] as const

export interface HubColumn {
  /** URL-safe and unique within its table (`?sort=key-metrics.asc`). */
  readonly id: string
  readonly title: string
  /** Where its cell sits in a row of the data. */
  readonly index: number
  /** Narrowest width in rem (its title fits; the table scrolls sideways below the sum). */
  readonly min: number
  /** Width in rem its content would like: wider columns take more of the spare room. */
  readonly ideal: number
}

export interface HubRow {
  readonly id: string
  readonly cells: readonly Inlines[]
  /** Plain text of each cell, "" for an empty one. */
  readonly text: readonly string[]
  /** Folded text of the whole row (and, for an article, its card): what the filter box matches. */
  readonly haystack: string
}

export interface ArticleRow extends HubRow {
  /** The article's key, from the link of its first cell; null if the row names none. */
  readonly key: string | null
  /** `<bib>/<key>` (the ref lists and articles share), or the row's id when it names no article. */
  readonly ref: string
  readonly article: Article | undefined
  readonly cite: string
  /** The article's title: the first sub-line of its cell, else its card's, else the cite. */
  readonly title: string
  /** Where the work was done: the cell's second sub-line ("" when none). */
  readonly place: string
  /** The words the data marks on the row ("draft", "record unreadable"). */
  readonly badges: readonly string[]
  readonly year: number | null
  readonly tags: readonly string[]
  readonly status: string
  readonly notice: NoticeLevel
  readonly notices: readonly Notice[]
}

export interface HubTableModel<R extends HubRow = HubRow> {
  readonly id: string
  readonly title: string
  readonly columns: readonly HubColumn[]
  readonly rows: readonly R[]
}

export interface FacetOption {
  readonly value: string
  readonly label: string
  /** How many articles have it, over the whole bibliography. */
  readonly count: number
}

export interface ArticleFacets {
  readonly tags: readonly FacetOption[]
  readonly statuses: readonly FacetOption[]
  readonly notices: readonly FacetOption[]
  /** The first and last years, or null when no article has one. */
  readonly years: readonly [number, number] | null
  /** Articles per year. */
  readonly perYear: ReadonlyMap<number, number>
}

export interface BibStats {
  readonly articles: number
  readonly complete: number
  readonly drafts: number
  readonly unreadable: number
  readonly flagged: number
  /** What the flagged ones are: "retracted" when they all are, else "retracted or flagged". */
  readonly flaggedWord: string
  readonly corrected: number
  readonly years: readonly [number, number] | null
}

export interface TagGroup {
  /** The dimension the tags belong to (the column they are written in), null for the rest. */
  readonly label: string | null
  readonly tags: readonly FacetOption[]
}

export interface HubModel {
  readonly articles: HubTableModel<ArticleRow>
  readonly others: readonly HubTableModel[]
  readonly facets: ArticleFacets
  readonly stats: BibStats
  /** The tags grouped by dimension (one group with a null label when they carry none). */
  readonly tagGroups: readonly TagGroup[]
  /** The Articles column of the key metrics or results (pinned when the table scrolls), if any. */
  readonly metricsColumn: string | null
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" })

/** Text order for sorting: numbers in text compare as numbers, case and accents ignored. */
export function compareText(a: string, b: string): number {
  return collator.compare(a, b)
}

/** The words of a filter query, folded; every one must match. */
export function queryTokens(query: string): string[] {
  return foldText(query).split(/\s+/).filter(Boolean)
}

export function matchesTokens(haystack: string, tokens: readonly string[]): boolean {
  for (const t of tokens) if (!haystack.includes(t)) return false
  return true
}

export function noticeLevel(notices: readonly Notice[]): NoticeLevel {
  if (notices.some(isSeriousNotice)) return "serious"
  return notices.length > 0 ? "correction" : "none"
}

/** "complete" → "Complete", "being_curated" → "Being curated". */
export function statusLabel(status: string): string {
  if (!status) return "No status"
  const words = status.replace(/[_-]+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A column id from its title: lower case, accents folded, dashes; "col-<i>" when nothing is left. */
export function columnSlug(title: string, index: number): string {
  const slug = foldText(title)
    .replace(/★/g, "star")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || `col-${index}`
}

function uniqueIds(titles: readonly string[], reserved: readonly string[]): string[] {
  const taken = new Set<string>(reserved)
  return titles.map((title, i) => {
    let id = columnSlug(title, i)
    if (taken.has(id)) {
      let n = 2
      while (taken.has(`${id}-${n}`)) n += 1
      id = `${id}-${n}`
    }
    taken.add(id)
    return id
  })
}

/**
 * Widths for each column from what it holds. `ideal` is about three lines of its average text,
 * within a readable measure; `min` keeps its title readable. The Articles table's first column is
 * wider: the citation, the title and the place are the row's name.
 */
export function columnWidths(
  head: readonly string[],
  text: readonly (readonly string[])[],
  { wideFirst = false }: { wideFirst?: boolean } = {}
): { min: number; ideal: number }[] {
  return head.map((title, i) => {
    let total = 0
    for (const row of text) total += Math.min(row[i]?.length ?? 0, 400)
    const average = text.length ? total / text.length : 0
    const byTitle = title.length * 0.5 + 2.5
    const wide = wideFirst && i === 0
    const min = Math.max(wide ? 17 : 8.5, byTitle)
    const ideal = wide ? 28 : Math.max(min, Math.min(20, average * 0.15 + 4))
    return { min: round(min), ideal: round(ideal) }
  })
}

/**
 * Each column's width in rem for a table `available` rem wide: every column gets its minimum, and
 * the room beyond the sum of minimums goes to columns in proportion to how much more they would like
 * (ideal − min), or to their minimums when none wants more. Below the sum of minimums the table
 * keeps them and scrolls sideways. Without a measure yet (`available` 0), the minimums.
 */
export function columnLayout(
  cols: readonly { min: number; ideal: number }[],
  available: number
): { width: number; widths: number[] } {
  const minSum = cols.reduce((sum, c) => sum + c.min, 0)
  const extra = available - minSum
  if (extra <= 0) return { width: minSum, widths: cols.map((c) => c.min) }
  const spare = cols.map((c) => Math.max(0, c.ideal - c.min))
  const spareSum = spare.reduce((a, b) => a + b, 0)
  const weights = spareSum > 0 ? spare.map((s) => s / spareSum) : cols.map((c) => c.min / minSum)
  return { width: available, widths: cols.map((c, i) => c.min + extra * (weights[i] ?? 0)) }
}

function round(rem: number): number {
  return Math.round(rem * 4) / 4
}

/** The key an Articles row names: the article link of its first cell. */
export function rowArticleKey(cells: readonly Inlines[]): string | null {
  for (const part of cells[0] ?? []) {
    if (typeof part !== "string" && part.t === "art") return part.key
  }
  return null
}

function articleHaystack(text: readonly string[], article: Article | undefined): string {
  const parts = [...text]
  if (article) {
    parts.push(
      article.cite,
      article.title,
      article.authors,
      article.venue,
      article.doi,
      article.year === null ? "" : String(article.year),
      article.tags.join(" "),
      article.one_line,
      article.status
    )
  }
  return foldText(parts.filter(Boolean).join("   "))
}

/** The sub-lines and badges of an Articles row's first cell. */
function leadParts(cells: readonly Inlines[]): { subs: string[]; badges: string[] } {
  const subs: string[] = []
  const badges: string[] = []
  for (const part of cells[0] ?? []) {
    if (typeof part === "string") continue
    if (part.t === "sub" && part.text.trim()) subs.push(part.text.trim())
    else if (part.t === "badge" && part.text.trim()) badges.push(part.text.trim())
  }
  return { subs, badges }
}

function buildArticles(bib: Bibliography, table: HubTable | undefined): HubTableModel<ArticleRow> {
  const byKey = new Map(bib.articles.map((a) => [a.key, a]))
  const head = table?.head ?? ["Article"]
  const sourceRows = table?.rows ?? []
  const text = sourceRows.map((cells) => head.map((_, i) => plainText(cells[i] ?? []).trim()))
  const widths = columnWidths(head, text, { wideFirst: true })
  const ids = uniqueIds(head, EXTRA_COLUMN_IDS)
  const columns = head.map((title, i) => ({ id: ids[i]!, title, index: i, ...widths[i]! }))

  const seen = new Set<string>()
  const rows = sourceRows.map((cells, i): ArticleRow => {
    const key = rowArticleKey(cells)
    const article = key === null ? undefined : byKey.get(key)
    const rowText = text[i]!
    let id = key ?? `row-${i}`
    if (seen.has(id)) id = `${id}~${i}`
    seen.add(id)
    const notices = article?.notices ?? []
    const { subs, badges } = leadParts(cells)
    const cite =
      article?.cite ||
      plainText((cells[0] ?? []).filter((p) => typeof p === "string" || p.t === "art")).trim() ||
      key ||
      ""
    return {
      id,
      cells,
      text: rowText,
      haystack: articleHaystack(rowText, article),
      key,
      ref: key === null ? id : `${bib.name}/${key}`,
      article,
      cite,
      title: subs[0] || article?.title || cite,
      place: subs[1] ?? "",
      badges,
      year: article?.year ?? null,
      tags: article?.tags ?? [],
      status: article?.status ?? "",
      notice: noticeLevel(notices),
      notices,
    }
  })
  return { id: table?.id ?? "articles", title: table?.title ?? "Articles", columns, rows }
}

function buildOther(table: HubTable): HubTableModel {
  const text = table.rows.map((cells) => table.head.map((_, i) => plainText(cells[i] ?? []).trim()))
  const widths = columnWidths(table.head, text)
  const ids = uniqueIds(table.head, [])
  return {
    id: table.id,
    title: table.title,
    columns: table.head.map((title, i) => ({ id: ids[i]!, title, index: i, ...widths[i]! })),
    rows: table.rows.map((cells, i) => ({
      id: `${table.id}-${i}`,
      cells,
      text: text[i]!,
      haystack: foldText(text[i]!.join("   ")),
    })),
  }
}

function countOptions(
  values: Iterable<string>,
  label: (value: string) => string,
  order: "count" | "given",
  given: readonly string[] = []
): FacetOption[] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const options = [...counts].map(([value, count]) => ({ value, label: label(value), count }))
  if (order === "given") {
    return options.sort((a, b) => given.indexOf(a.value) - given.indexOf(b.value))
  }
  return options.sort((a, b) => b.count - a.count || compareText(a.label, b.label))
}

function buildFacets(rows: readonly ArticleRow[]): ArticleFacets {
  const years = rows.map((r) => r.year).filter((y): y is number => y !== null)
  return {
    tags: countOptions(
      rows.flatMap((r) => r.tags),
      (t) => t,
      "count"
    ),
    statuses: countOptions(
      rows.map((r) => r.status),
      statusLabel,
      "count"
    ),
    notices: countOptions(
      rows.map((r) => r.notice),
      (v) => NOTICE_LEVEL_LABELS[v as NoticeLevel],
      "given",
      NOTICE_LEVELS
    ),
    years: years.length ? [Math.min(...years), Math.max(...years)] : null,
    perYear: years.reduce((m, y) => m.set(y, (m.get(y) ?? 0) + 1), new Map<number, number>()),
  }
}

function buildStats(bib: Bibliography): BibStats {
  const years = bib.articles.map((a) => a.year).filter((y): y is number => y !== null)
  let flagged = 0
  let corrected = 0
  const words = new Set<string>()
  for (const a of bib.articles) {
    const level = noticeLevel(a.notices)
    if (level === "serious") {
      flagged += 1
      const notice = seriousNotice(a.notices)
      if (notice) words.add(noticeLabel(notice).toLowerCase())
    } else if (level === "correction") corrected += 1
  }
  return {
    articles: bib.articles.length,
    complete: bib.complete,
    drafts: bib.articles.filter((a) => a.status === "draft").length,
    unreadable: bib.articles.filter((a) => a.error !== undefined).length,
    flagged,
    flaggedWord: words.size === 1 ? [...words][0]! : "retracted or flagged",
    corrected,
    years: years.length ? [Math.min(...years), Math.max(...years)] : null,
  }
}

/** Tags that say "nothing in particular": listed last in their group. */
const VAGUE_TAGS = new Set([
  "not applicable",
  "n/a",
  "na",
  "other",
  "others",
  "none",
  "unknown",
  "misc",
])

export function isVagueTag(tag: string): boolean {
  return VAGUE_TAGS.has(foldText(tag).trim())
}

/** The values a cell lists ("Drainage · Night-time · Campaign", "Probe array: 2"), folded. */
export function cellTokens(text: string): Set<string> {
  const tokens = new Set<string>()
  const whole = foldText(text).trim()
  if (whole) tokens.add(whole)
  for (const piece of whole.split(/\s*[·;,:|/()]\s*|\s+[–—-]\s+|\.\s+/)) {
    const t = piece.replace(/[.\s]+$/, "").trim()
    if (t) tokens.add(t)
  }
  return tokens
}

/**
 * The tags grouped by the dimension they belong to. The data's tags carry no dimension, but the
 * Articles table writes most of them in its columns (Task: "Drainage · Night-time · Campaign";
 * Sensors: "Probe array: 2"): a tag found in one column for at least half of its articles belongs
 * to that column. The rest are "Other tags". Vague tags ("not applicable", "Other") go last in their
 * group. One group alone is no grouping: then a single group without a label.
 */
export function groupTags(
  rows: readonly ArticleRow[],
  columns: readonly HubColumn[],
  tags: readonly FacetOption[]
): TagGroup[] {
  const dataColumns = columns.filter((c) => c.index > 0)
  const tokens = rows.map((r) => dataColumns.map((c) => cellTokens(r.text[c.index] ?? "")))
  const byColumn = new Map<number, FacetOption[]>()
  const rest: FacetOption[] = []
  for (const tag of tags) {
    const folded = foldText(tag.value).trim()
    const hits = dataColumns.map(() => 0)
    let tagged = 0
    rows.forEach((row, r) => {
      if (!row.tags.includes(tag.value)) return
      tagged += 1
      dataColumns.forEach((_, c) => {
        if (tokens[r]![c]!.has(folded)) hits[c]! += 1
      })
    })
    const best = hits.reduce((b, n, c) => (n > (hits[b] ?? 0) ? c : b), 0)
    if (tagged > 0 && (hits[best] ?? 0) * 2 >= tagged && (hits[best] ?? 0) > 0) {
      const list = byColumn.get(best) ?? []
      list.push(tag)
      byColumn.set(best, list)
    } else {
      rest.push(tag)
    }
  }
  const order = (list: FacetOption[]) =>
    list.sort(
      (a, b) =>
        Number(isVagueTag(a.value)) - Number(isVagueTag(b.value)) ||
        b.count - a.count ||
        compareText(a.label, b.label)
    )
  const groups: TagGroup[] = [...byColumn.keys()]
    .sort((a, b) => a - b)
    .map((c) => ({ label: dataColumns[c]!.title, tags: order(byColumn.get(c)!) }))
  if (rest.length) groups.push({ label: groups.length ? "Other tags" : null, tags: order(rest) })
  if (groups.length === 1) return [{ label: null, tags: groups[0]!.tags }]
  return groups
}

/** The column of key metrics or results: its title says so ("Key metrics", "Key results"). */
export function findMetricsColumn(columns: readonly HubColumn[]): string | null {
  const found = columns.find(
    (c) => c.index > 0 && /\b(?:metrics?|results?)\b/.test(foldText(c.title))
  )
  return found?.id ?? null
}

/**
 * The scope as the header shows it: its first sentence, cut at a word near `max` characters when
 * it runs longer (never inside a parenthesis), and whether there is more to read.
 */
export function scopeLead(scope: string, max = 140): { lead: string; more: boolean } {
  const text = scope.replace(/\s+/g, " ").trim()
  if (!text) return { lead: "", more: false }
  const end = /[.!?](?=\s+[A-Z\u00C0-\u024F“"(])/u.exec(text)
  const sentence = end ? text.slice(0, end.index + 1) : text
  if (sentence.length <= max) return { lead: sentence, more: sentence.length < text.length }
  let cut = text.lastIndexOf(" ", max)
  if (cut <= 0) cut = max
  const open = text.lastIndexOf("(", cut)
  if (open > 0 && text.indexOf(")", open) > cut) cut = text.lastIndexOf(" ", open) > 0 ? open : cut
  const lead = text
    .slice(0, cut)
    .replace(/[\s,;:–—(-]+$/u, "")
    .trim()
  return { lead: `${lead}…`, more: true }
}

const cache = new WeakMap<Bibliography, HubModel>()

/** The hub of a bibliography, built once per loaded library (bibliography objects are stable). */
export function hubModel(bib: Bibliography): HubModel {
  let model = cache.get(bib)
  if (!model) {
    const [first, ...rest] = bib.tables
    const articlesTable = first && first.id === "articles" ? first : undefined
    const articles = buildArticles(bib, articlesTable)
    const facets = buildFacets(articles.rows)
    model = {
      articles,
      others: (articlesTable ? rest : bib.tables).map(buildOther),
      facets,
      stats: buildStats(bib),
      tagGroups: groupTags(articles.rows, articles.columns, facets.tags),
      metricsColumn: findMetricsColumn(articles.columns),
    }
    cache.set(bib, model)
  }
  return model
}

/** A confidence interval after a value: "(95% CI 7.2, 11.2)", "(CI [18.5, 28.0])", ", 95% CI 7–11". */
const CI =
  /\s*\((?:\s*\d+(?:\.\d+)?\s?%)?\s*(?:CI|confidence interval)\b[^()]*\)|,?\s+\d+(?:\.\d+)?\s?%\s*(?:CI|confidence interval)\b.*$/iu

/** A value and its confidence interval as written ("" when it gives none). */
export function splitCI(text: string): { value: string; ci: string } {
  const m = CI.exec(text)
  if (!m) return { value: text, ci: "" }
  return {
    value: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trimEnd(),
    ci: m[0],
  }
}

/** A confidence interval's bounds: "(95% CI 7.2, 11.2)" → "7.2–11.2"; as written if unclear. */
export function ciBounds(ci: string): string {
  const inner = ci
    .replace(/^[\s,(]+|[\s)]+$/gu, "")
    .replace(/^\d+(?:\.\d+)?\s?%\s*/u, "")
    .replace(/^(?:CI|confidence interval)\b[:\s]*/iu, "")
    .replace(/^\[|\]$/gu, "")
    .trim()
  const m = /^([−-]?\d[\d.,]*(?:\s?%)?)\s*(?:,|–|-|to)\s*([−-]?\d[\d.,]*(?:\s?%)?)$/u.exec(inner)
  return m ? `${m[1]}–${m[2]}` : inner
}

/** "2009–2026", or the one year. */
export function formatYearSpan(years: readonly [number, number]): string {
  return years[0] === years[1] ? String(years[0]) : `${years[0]}–${years[1]}`
}
