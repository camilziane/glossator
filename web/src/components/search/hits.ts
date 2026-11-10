/**
 * Search hits from /api/search, made ready to show: grouped by article (in the order of each
 * article's best passage), each passage with what it is (a page of the paper, of a supplementary
 * file, a section of the summary), the page to cite and the links that open it.
 */
import { pageRefOf, type PageRef } from "@/components/content/page-mark"
import type { SearchHit } from "@/lib/api"
import type { CitePlace } from "@/lib/cite"
import {
  articleFileHref,
  foldText,
  libraryHref,
  pdfPageHref,
  plainText,
  readArticleView,
  recordField,
  type ArticleEntry,
  type ArticleView,
  type Inlines,
  type LibraryIndex,
} from "@/lib/data"

import { isReviewText, parseRecordSnippet, type FileKind } from "./snippet"

export interface HitGroup {
  /** `<bib>/<key>` */
  ref: string
  bib: string
  key: string
  cite: string
  /** The article in the loaded library, when it is there (the index may be newer than the data). */
  entry: ArticleEntry | undefined
  hits: SearchHit[]
}

/** Hits grouped by article, the groups in the order of their first (best) hit. */
export function groupHits(hits: readonly SearchHit[], lib: LibraryIndex | null): HitGroup[] {
  const groups = new Map<string, HitGroup>()
  for (const hit of hits) {
    const ref = `${hit.bib}/${hit.key}`
    let group = groups.get(ref)
    if (!group) {
      group = {
        ref,
        bib: hit.bib,
        key: hit.key,
        cite: hit.cite,
        entry: lib?.article(hit.bib, hit.key),
        hits: [],
      }
      groups.set(ref, group)
    }
    group.hits.push(hit)
  }
  return [...groups.values()]
}

/** The hits in the order they are drawn (group by group). */
export function orderedHits(groups: readonly HitGroup[]): SearchHit[] {
  return groups.flatMap((g) => g.hits)
}

export type SourceKind = "paper" | "supplementary" | "record" | "file"

/** A row of an article's Key metrics (or Key results) table, as the reader reads it. */
export interface MetricRow {
  /** The table's head ("Metric", "Value", "Condition", "Chance or baseline", "Source"). */
  head: string[]
  cells: Inlines[]
  /** The cells as text, by role. */
  name: string
  value: string
  condition: string
  baseline: string
  source: string
  headline: boolean
}

export interface HitPage {
  /** The first page named. */
  page: number
  /** "SI" for a page of the supplementary information. */
  doc?: string
  /** As it reads: "p. 4". */
  text: string
  /** The PDF at that page, when there is one to open. */
  href: string | null
}

export interface HitPlace {
  kind: SourceKind
  /** A summary's passage: the section's title in the article ("Key metrics"). */
  section: string | null
  /** The section's id in the article (its anchor), when the article has it. */
  sectionId: string | null
  /**
   * A file other than the paper: its name, what it is (`role`: the record's label when it says more
   * than the name, else what its first page says) and the record's label as written.
   */
  file: { name: string; role: string | null; label: string | null } | null
  /** The page to cite and to open. */
  page: HitPage | null
  /** The file at the passage (the PDF at its page), opened in a new tab; null for a summary. */
  fileHref: string | null
  /** For a metric or a result of the summary: its row of the table. */
  metric: MetricRow | null
  /** Where a citation of the passage points (`citePlace`'s rule); null without a page. */
  cite: CitePlace | null
  /** The paper's PDF (no page), for the page references a summary's lines make. */
  paperHref: string | null
  /** A referee report (a peer review file): its words are a referee's, not the paper's. */
  review: boolean
}

function viewOf(entry: ArticleEntry | undefined): ArticleView | null {
  return entry ? readArticleView(entry.article).view : null
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path
}

/** `record:metrics[2]` → 2. */
function itemIndex(source: string): number | null {
  const m = /\[(\d+)\]$/.exec(source)
  return m ? Number(m[1]) : null
}

/** What a record field is called when the article has no section for it. */
const FIELD_SECTIONS: Readonly<Record<string, string>> = {
  bib: "Reference",
  paper: "The paper",
  supplementary: "Supplementary material",
  curation: "Curation",
  figures: "Figures",
}

function humanize(field: string): string {
  const words = field.replaceAll(/[_-]+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Row `index` of the first table of the section `id`, read as a metric. */
function metricRow(view: ArticleView | null, id: string, index: number | null): MetricRow | null {
  if (!view || index === null) return null
  const table = view.sections
    .find((s) => s.id === id)
    ?.blocks.find((b) => b.t === "table" && b.head.includes("Value"))
  if (!table || table.t !== "table") return null
  const cells = table.rows[index]
  if (!cells) return null
  const col = (name: RegExp) => table.head.findIndex((h) => name.test(h))
  const text = (i: number) => (i >= 0 ? plainText(cells[i] ?? []).trim() : "")
  return {
    head: table.head,
    cells,
    name: text(col(/^Metric|^Result|^Name/i)),
    value: text(col(/^Value/i)),
    condition: text(col(/^Condition/i)),
    baseline: text(col(/baseline|chance/i)),
    source: text(col(/^Source/i)),
    headline: text(col(/★/)) === "★",
  }
}

/** The paper's PDF of an article. */
function paperFile(entry: ArticleEntry | undefined, view: ArticleView | null) {
  const primary = view?.files.find((f) => f.primary)
  const href = entry ? articleFileHref(entry.bib.name, entry.article.key, "paper.pdf") : null
  return { href: primary ? (libraryHref(primary.href) ?? href) : href }
}

/** A page reference of a summary's passage (its source, a quote's where), opened in the paper. */
function recordPage(ref: PageRef | null, paperHref: string | null): HitPage | null {
  if (!ref) return null
  return {
    page: ref.page,
    ...(ref.doc ? { doc: ref.doc } : {}),
    text: ref.text,
    href: !ref.doc && paperHref ? pdfPageHref(paperHref, ref.page) : null,
  }
}

/** Where a hit is, said for a reader, with the links that open it there. */
export function hitPlace(
  hit: SearchHit,
  entry: ArticleEntry | undefined,
  kind?: FileKind
): HitPlace {
  const view = viewOf(entry)
  const paper = paperFile(entry, view)
  const field = recordField(hit.source)
  if (field !== null) {
    const id = field.replaceAll("_", "-")
    const section = view?.sections.find((s) => s.id === id)
    const metric = metricRow(view, id, itemIndex(hit.source))
    let ref: PageRef | null = metric ? pageRefOf(metric.source) : null
    if (!ref) {
      // The page a quote's "where" or a section's "source" names, as the snippet shows it.
      for (const part of parseRecordSnippet(hit.snippet, field).parts) {
        if (part.field && /(?:^|\.)(?:where|source)$/.test(part.field)) ref = pageRefOf(part.text)
        if (ref) break
      }
    }
    return {
      kind: "record",
      section: section?.title ?? FIELD_SECTIONS[field] ?? humanize(field),
      sectionId: section ? id : null,
      file: null,
      page: recordPage(ref, paper.href),
      fileHref: null,
      metric,
      cite: ref ? (ref.doc ? { page: ref.page, file: ref.doc } : { page: ref.page }) : null,
      paperHref: paper.href,
      review: false,
    }
  }

  const fileHref = entry
    ? articleFileHref(entry.bib.name, entry.article.key, hit.source)
    : articleFileHref(hit.bib, hit.key, hit.source)
  const isPdf = /\.pdf$/i.test(hit.source)
  const page: HitPage | null =
    hit.page !== null && hit.page > 0
      ? {
          page: hit.page,
          ...(hit.source === "paper.pdf" ? {} : { doc: "SI" }),
          text: `p. ${hit.page}`,
          href: isPdf && fileHref ? pdfPageHref(fileHref, hit.page) : null,
        }
      : null
  const opened = fileHref ? pdfPageHref(fileHref, hit.page) : null
  if (hit.source === "paper.pdf") {
    return {
      kind: "paper",
      section: null,
      sectionId: null,
      file: null,
      page,
      fileHref: opened,
      metric: null,
      cite: page ? { page: page.page } : null,
      paperHref: paper.href,
      review: false,
    }
  }
  const label =
    view?.files.find((f) => f.href.endsWith(`/${hit.key}/${hit.source}`))?.label.trim() || null
  // A role that only repeats the file's name ("Table S1" for "…/table_s1.pdf") says nothing.
  const squash = (s: string) => foldText(s).replace(/[^a-z0-9]/g, "")
  const named = label && !squash(hit.source).includes(squash(label)) ? label : null
  // A referee report, by its label, its first page or the passage's own words.
  const review = kind === "review" || isReviewText(label ?? "") || isReviewText(hit.snippet)
  const role = review ? "Referee report" : (named ?? (kind ? KIND_ROLES[kind] : null))
  return {
    kind: hit.source.startsWith("supplementary/") ? "supplementary" : "file",
    section: null,
    sectionId: null,
    file: { name: fileName(hit.source), role, label },
    page,
    fileHref: opened,
    metric: null,
    // A supplementary page names its file: the record's label when it says something, else what
    // its first page says it is ("SI", "Peer review file"), else the label as it is.
    cite: page
      ? { page: page.page, file: named ?? (kind ? KIND_CITES[kind] : null) ?? label ?? "" }
      : null,
    paperHref: paper.href,
    review,
  }
}

/** What a file's first page says it is, when its record's label does not. */
const KIND_ROLES: Record<FileKind, string | null> = {
  review: "Referee report",
  reporting: "Reporting summary",
  information: "Supplementary information",
  other: null,
}

/** How a citation names a file its record's label does not name. */
const KIND_CITES: Record<FileKind, string | null> = {
  review: "Peer review file",
  reporting: "Reporting summary",
  information: "SI",
  other: null,
}

/** `<bib>/<key>/<source>`: a file of an article, as `useFileKinds` keys it. */
export function fileRef(hit: Pick<SearchHit, "bib" | "key" | "source">): string {
  return `${hit.bib}/${hit.key}/${hit.source}`
}

export interface ParsedRef {
  bib: string
  key: string
  source: string
  page: number | null
  passage: number | null
}

/**
 * A passage reference (`<bib>/<key>/<source>#<page>.<passage>` or `<bib>/<key>/record:<field>`), as
 * the server parses it (index.parse_ref); null when it is not one.
 */
export function parseRef(ref: string): ParsedRef | null {
  const m = /^([^/]+)\/([^/]+)\/(.+?)(?:#(\d+)(?:\.(\d+))?)?$/.exec(ref.trim())
  if (!m) return null
  const [, bib, key, source, page, passage] = m
  if (!bib || !key || !source) return null
  return {
    bib,
    key,
    source,
    page: page ? Number(page) : null,
    passage: passage !== undefined ? Number(passage) : null,
  }
}

/** A hit rebuilt from its reference alone (a shared link to a passage no longer in the results). */
export function hitFromRef(ref: string, lib: LibraryIndex | null): SearchHit | null {
  const parsed = parseRef(ref)
  if (!parsed) return null
  const entry = lib?.article(parsed.bib, parsed.key)
  return { ref, cite: entry?.article.cite ?? parsed.key, snippet: "", ...parsed }
}
