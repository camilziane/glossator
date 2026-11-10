/**
 * The words of a search hit, made readable. The server's snippets are cut where its index cut them
 * (an ellipsis at either end), and a summary's passages are its record's `field: value` lines
 * flattened into one (`value: 9.1% condition: online`). Here a text passage starts where a reader
 * can start, and a summary's passage becomes labelled parts: a raw field name never shows.
 */
import { matchRanges } from "./highlight"

const ELLIPSIS = "…"

// ---------------------------------------------------------------------------- text passages

export interface TidySnippet {
  text: string
  /** The passage was cut before this text (draw "…" before it). */
  cutStart: boolean
  /** The passage goes on after this text (draw "…" after it). */
  cutEnd: boolean
}

/** A sentence or clause boundary followed by what starts a sentence. */
const BOUNDARY = /[.!?;:]["”’)]?\s+(?=["“‘(\[]?[\p{Lu}\d])/gu
/** A sliver of a word left by the cut: "a, " before "Toy filter scores…" (a figure's panel letter). */
const SLIVER = /^[\p{Ll}\p{N}]{1,3}[,;:)]\s+/u
/** How far into the passage its first sentence may start for the cut to move there. */
const HEAD_MAX = 90

/**
 * A text passage's snippet, tidied: `...` read as one ellipsis, and a passage cut mid-sentence starts
 * at its next sentence when that is near and the words before it hold no match; one that starts with
 * a capital is read as a sentence start. The ellipses are returned as flags, not in the text.
 */
export function tidySnippet(snippet: string, terms: readonly string[] = []): TidySnippet {
  let text = snippet.replace(/\.{3}/g, ELLIPSIS).replace(/\s+/g, " ").trim()
  const cutStart = text.startsWith(ELLIPSIS)
  const cutEnd = text.endsWith(ELLIPSIS) && text.length > 1
  if (cutStart) text = text.slice(1).trimStart()
  if (cutEnd) text = text.slice(0, -1).trimEnd()
  if (!cutStart || !text) return { text, cutStart, cutEnd }

  const sliver = SLIVER.exec(text)
  if (sliver && /^\P{Ll}/u.test(text.slice(sliver[0].length))) {
    text = text.slice(sliver[0].length)
  }
  if (/^["“‘(\[]?\p{Lu}/u.test(text)) return { text, cutStart: false, cutEnd }

  const limit = Math.min(HEAD_MAX, Math.floor(text.length * 0.45))
  for (const m of text.matchAll(BOUNDARY)) {
    const at = m.index + m[0].length
    if (at > limit) break
    const head = text.slice(0, at)
    if (matchRanges(head, terms).length > 0) break
    return { text: text.slice(at), cutStart: false, cutEnd }
  }
  return { text, cutStart, cutEnd }
}

// ---------------------------------------------------------------------------- record passages

/**
 * The record's field names (the base every record shares and the built-in profiles' details), so
 * that only these read as labels in a flattened passage: "condition: online" is a field, "ratio: 3"
 * in prose is not one of them.
 */
const FIELDS: ReadonlySet<string> = new Set(
  (
    "title authors year date venue venue_short volume issue pages doi pmid pmcid type cite place lab " +
    "version host license retrieved note status label role from caption one_line abstract kind " +
    "file files bytes sha256 source_url figure figures name value condition baseline headline " +
    "source text where in quote quotes link why same_topic search read checks claim verdict " +
    "problem idea architecture input training datasets cost code population design data_source " +
    "measure open_points overview details results metrics related curation supplementary paper bib"
  ).split(" ")
)

/**
 * The fields each section of a record holds (its items' too): in a section named here, only these
 * read as labels (an open point that says "figure: …" is prose, not a field).
 */
const SECTION_FIELDS: Readonly<Record<string, string>> = {
  overview: "one_line abstract",
  open_points: "open_points",
  metrics: "name value condition baseline source",
  results: "name value condition baseline source",
  quotes: "text where in",
  related: "same_topic link cite title why search",
  curation: "date read checks claim verdict",
  bib: "title authors year date venue venue_short volume issue pages doi pmid pmcid type cite place lab",
  paper: "version host license pages retrieved note",
  supplementary: "status note files label pages",
}

function fieldsOf(section: string | null): ReadonlySet<string> {
  const names = section ? SECTION_FIELDS[section] : undefined
  return names ? new Set(names.split(" ")) : FIELDS
}

/** Labels in the article's own words (render.py) where the field's name would not say it. */
const LABELS: Readonly<Record<string, string>> = {
  one_line: "In one line",
  name: "Metric",
  baseline: "Chance or baseline",
  architecture: "Architecture or algorithm",
  where: "Where",
  text: "Quote",
  quote: "Quote",
  in: "In",
  doi: "DOI",
  pmid: "PMID",
  pmcid: "PMCID",
  sha256: "SHA-256",
  source_url: "Source URL",
  data_source: "Data sources",
  measure: "Measures",
  open_points: "Open points",
  same_topic: "Same topic",
  venue_short: "Venue",
}

/** "data_source" → "Data source". */
function humanize(name: string): string {
  const words = name.replaceAll(/[_-]+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The last name of a field path without its index: `quotes[0].where` → "where". */
export function fieldName(path: string): string {
  const last = path.split(".").at(-1) ?? path
  return last.replace(/\[\d+\]$/, "")
}

/** A field path as a reader's label: `quotes[1].where` → "Where", `one_line` → "In one line". */
export function fieldLabel(path: string): string {
  const name = fieldName(path)
  return LABELS[name] ?? humanize(name)
}

/** The order of an item's fields in a record, to name the field a cut passage starts inside. */
const ITEM_ORDER: Readonly<Record<string, readonly string[]>> = {
  quote: ["text", "where", "in"],
  quotes: ["text", "where", "in"],
  metrics: ["name", "value", "condition", "baseline", "source"],
  results: ["name", "value", "condition", "baseline", "source"],
  checks: ["claim", "verdict"],
  same_topic: ["link", "cite", "title", "why"],
}

/** The fields of a record's sections, in order (for a passage whose first field was cut). */
const SECTION_ORDER: Readonly<Record<string, readonly string[]>> = {
  overview: ["one_line", "abstract"],
  metrics: ITEM_ORDER.metrics ?? [],
  results: ITEM_ORDER.results ?? [],
  curation: ["date", "read"],
}

export interface RecordPart {
  /** The field's path in the record (`quotes[1].where`), or null when it cannot be told. */
  field: string | null
  /** The reader's label for it ("Where"), or null. */
  label: string | null
  text: string
}

export interface RecordSnippet {
  parts: RecordPart[]
  /** The passage was cut before its first part / goes on after its last. */
  cutStart: boolean
  cutEnd: boolean
}

/** `field: ` (a known field, maybe in a list item: `quotes[0].where: `), where a value starts. */
const LABEL = /(^|\s)((?:[a-z][a-z0-9_]*(?:\[\d+\])?\.)*([a-z][a-z0-9_]*)(?:\[\d+\])?):(?=\s|$)/g

/** A label the snippet cut before its colon, at its end: "quotes[1", "checks[5].verdict". */
const CUT_LABEL = /\s+[a-z][a-z0-9_]*(?:\[\d*\]?)?(?:\.[a-z0-9_[\]]*)*$/

/** The field before `path` in its item or section (null when it is the first, or unknown). */
function previousField(path: string, section: string | null): string | null {
  const dot = path.lastIndexOf(".")
  const item = dot >= 0 ? path.slice(0, dot) : ""
  const name = fieldName(path)
  const container = item ? fieldName(item) : (section ?? "")
  const order = (item ? ITEM_ORDER[container] : SECTION_ORDER[container]) ?? []
  const at = order.indexOf(name)
  if (at <= 0) return null
  const prev = order[at - 1] ?? null
  return prev && item ? `${item}.${prev}` : prev
}

/**
 * A summary's passage (`record:<section>`), flattened `field: value` lines in one string, as parts
 * with labels. The part before the first label (the passage was cut inside a field) is named from
 * the record's order when it can be. `section` is the record's section (`metrics` for
 * `record:metrics[2]`): the fields of a list item are then its own.
 */
export function parseRecordSnippet(snippet: string, section: string | null = null): RecordSnippet {
  let text = snippet.replace(/\.{3}/g, ELLIPSIS).replace(/\s+/g, " ").trim()
  const cutStart = text.startsWith(ELLIPSIS)
  const cutEnd = text.endsWith(ELLIPSIS) && text.length > 1
  if (cutStart) text = text.slice(1).trimStart()
  if (cutEnd) text = text.slice(0, -1).trimEnd()
  // A label cut before its colon says nothing: drop it (the ellipsis stays).
  if (cutEnd) {
    const tail = CUT_LABEL.exec(text)
    if (tail && /[[_]/.test(tail[0])) text = text.slice(0, tail.index).trimEnd()
  }

  const known = fieldsOf(section)
  const labels: { at: number; end: number; path: string }[] = []
  for (const m of text.matchAll(LABEL)) {
    const name = m[3] ?? ""
    if (!known.has(name)) continue
    const at = m.index + (m[1]?.length ?? 0)
    labels.push({ at, end: m.index + m[0].length, path: m[2] ?? name })
  }

  const parts: RecordPart[] = []
  const head = text.slice(0, labels[0]?.at ?? text.length).trim()
  if (head) {
    const field = labels[0] ? previousField(labels[0].path, section) : null
    parts.push({ field, label: field ? fieldLabel(field) : null, text: head })
  }
  labels.forEach((l, i) => {
    const value = text.slice(l.end, labels[i + 1]?.at ?? text.length).trim()
    if (value) parts.push({ field: l.path, label: fieldLabel(l.path), text: value })
  })
  return { parts: parts.filter((p) => !isNoise(p)), cutStart, cutEnd }
}

/** Parts that say nothing to a reader: a quote's `in: this paper` (or what the cut left of it). */
function isNoise(part: RecordPart): boolean {
  if (part.field === null || fieldName(part.field) !== "in") return false
  const text = part.text
    .replace(/[.…]+$/, "")
    .trim()
    .toLowerCase()
  return text.length > 0 && "this paper".startsWith(text)
}

// ---------------------------------------------------------------------------- record text, whole

export interface RecordLine {
  field: string
  label: string
  value: string
}

export interface RecordGroup {
  /** "Quote 2", "Check 1"; null for the section's own fields. */
  title: string | null
  /** The item's path (`quotes[0]`), or "" for the section's own fields. */
  item: string
  lines: RecordLine[]
}

/** What one item of a list is called, by its list's name. */
const ITEM_NAMES: Readonly<Record<string, string>> = {
  quotes: "Quote",
  checks: "Check",
  files: "File",
  same_topic: "Same topic",
}

/**
 * A summary's passage read whole (/api/read: one `field: value` line each), grouped by the list item
 * each line belongs to, with labels. Lines that are not `field: value` continue the line before.
 */
export function parseRecordText(text: string): RecordGroup[] {
  const groups: RecordGroup[] = []
  let last: RecordLine | null = null
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const m = /^((?:[a-z][a-z0-9_]*(?:\[\d+\])?\.)*([a-z][a-z0-9_]*)(?:\[\d+\])?):\s?(.*)$/.exec(
      line
    )
    if (!m || !FIELDS.has(m[2] ?? "")) {
      if (last) last.value = `${last.value} ${line}`.trim()
      else
        groups.push({
          title: null,
          item: "",
          lines: [(last = { field: "", label: "", value: line })],
        })
      continue
    }
    const path = m[1] ?? ""
    const dot = path.lastIndexOf(".")
    const item = dot >= 0 ? path.slice(0, dot) : ""
    const entry: RecordLine = { field: path, label: fieldLabel(path), value: (m[3] ?? "").trim() }
    if (isNoise({ field: path, label: entry.label, text: entry.value })) continue
    let group = groups.at(-1)
    if (!group || group.item !== item) {
      group = { title: itemTitle(item), item, lines: [] }
      groups.push(group)
    }
    group.lines.push(entry)
    last = entry
  }
  return groups
}

/** `quotes[0]` → "Quote 1"; `same_topic[1]` → "Same topic 2"; "" → null. */
function itemTitle(item: string): string | null {
  if (!item) return null
  const m = /([a-z][a-z0-9_]*)\[(\d+)\]$/.exec(item)
  if (!m) return fieldLabel(item)
  const name = m[1] ?? ""
  return `${ITEM_NAMES[name] ?? humanize(name)} ${Number(m[2]) + 1}`
}

// ---------------------------------------------------------------------------- fragments

/** Where a clause ends (a comma, a semicolon, a stop, a dash, a closing bracket), then a space. */
const CLAUSE_END = /[,;:.!?)\]]["”’]?\s+|\s[—–]\s/g

/**
 * A fragment of `text` around its first match (`terms`), at most `width` characters, cut on clause
 * boundaries when they fall within reach ("…online scoring of the toy set, 50 samples…"), else at
 * words: for the palette's line under a title when the match is in the one-liner. Null when
 * nothing matches.
 */
export function fragmentAround(
  text: string,
  terms: readonly string[],
  width = 110
): TidySnippet | null {
  const flat = text.replace(/\s+/g, " ").trim()
  const first = matchRanges(flat, terms)[0]
  if (!first) return null
  if (flat.length <= width) return { text: flat, cutStart: false, cutEnd: false }
  const clauses = [...flat.matchAll(CLAUSE_END)].map((m) => m.index + m[0].length)
  // The start: the earliest clause start that leaves the match well inside the room.
  const reach = first.end - Math.floor(width * 0.7)
  let start = clauses.find((c) => c >= reach && c <= first.start) ?? -1
  if (start < 0 && first.start <= Math.floor(width * 0.3)) start = 0
  if (start < 0) {
    // No clause within reach: some words before the match.
    const from = Math.max(0, first.start - Math.floor(width * 0.3))
    const space = flat.indexOf(" ", from)
    start = space >= 0 && space < first.start ? space + 1 : from
  }
  // The end: the last clause end within the room, else the last word that fits.
  const limit = Math.min(flat.length, start + width)
  let end =
    limit === flat.length
      ? limit
      : ([...clauses].reverse().find((c) => c > first.end && c <= limit) ?? -1)
  if (end < 0) {
    const space = flat.lastIndexOf(" ", limit)
    end = space > first.end ? space : limit
  }
  return {
    text: flat.slice(start, end).replace(/[\s,;:—–]+$/, ""),
    cutStart: start > 0,
    cutEnd: end < flat.length,
  }
}

// ---------------------------------------------------------------------------- quotes

/** Words a stop follows without ending a sentence. */
const ABBREVIATION =
  /(?:\bal|\bFigs?|\be\.g|\bi\.e|\bcf|\bvs|\bEqs?|\bRefs?|\bNo|\bapprox|\bca|\bSuppl|\bp|\bpp|\bvol|\b[A-Z])\.$/

/**
 * The ends of the sentences of `text` (after their stop and closing quote). A figure's panel
 * ("… protein structures. a, Median accuracy …") starts a sentence too.
 */
function sentenceEnds(text: string): number[] {
  const ends: number[] = []
  for (const m of text.matchAll(/[.!?]["”’)\]]*(?=\s+["“‘(\[]?\p{Lu}|\s+[a-z],\s|\s*$)/gu)) {
    const before = text.slice(Math.max(0, m.index - 8), m.index + 1)
    if (m[0].startsWith(".") && ABBREVIATION.test(before)) continue
    ends.push(m.index + m[0].length)
  }
  return ends
}

/**
 * The whole sentences of a passage that hold its snippet: what `y` copies, so a quote never starts
 * or ends inside a sentence on the index's cut. Null when the snippet is not found in the passage.
 * A sentence the passage itself cuts (it starts on a page's first words) keeps an ellipsis.
 */
export function quoteSentences(passage: string, snippet: string): string | null {
  const text = passage.replace(/\s+/g, " ").trim()
  // The snippet as the index cut it (only its ellipses dropped): every sentence it touches.
  const core = snippet
    .replace(/\.{3}/g, ELLIPSIS)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^…\s*|\s*…$/g, "")
  if (!text || !core) return null
  // The snippet in the passage: whole, else its longest beginning of at least four words.
  let at = text.indexOf(core)
  let length = core.length
  if (at < 0) {
    const words = core.split(" ")
    for (let n = words.length - 1; n >= 4 && at < 0; n--) {
      const head = words.slice(0, n).join(" ")
      at = text.indexOf(head)
      length = head.length
    }
  }
  if (at < 0) return null
  const ends = sentenceEnds(text)
  const start = [0, ...ends.filter((e) => e <= at)].at(-1) ?? 0
  const end = ends.find((e) => e >= at + length) ?? text.length
  // A figure's panel letter ("a, ") is no word of the sentence.
  const quote = text
    .slice(start, end)
    .trim()
    .replace(/^[a-z],\s+(?=\p{Lu})/u, "")
  const cutBefore = start === 0 && /^[\p{Ll}\d,;]/u.test(quote)
  const cutAfter = end === text.length && !/[.!?]["”’)\]]*$/.test(quote)
  return `${cutBefore ? "…" : ""}${quote}${cutAfter ? "…" : ""}`
}

// ---------------------------------------------------------------------------- files

/** What a supplementary file is, from the words of its first page (or of a passage). */
export type FileKind = "review" | "reporting" | "information" | "other"

const REVIEW =
  /peer review file|reviewers?['’]? comments|reviewer reports?|\b(?:referee|reviewer)\s*#\s*\d|remarks to the authors?|response to (?:the )?reviewers|author rebuttals?/i

/** A referee report's words, wherever they show (its first page, a passage, a snippet). */
export function isReviewText(text: string): boolean {
  return REVIEW.test(text)
}

/** A supplementary file's kind, read from its first page. */
export function fileKindOf(firstPage: string): FileKind {
  const head = firstPage.slice(0, 600)
  if (isReviewText(head)) return "review"
  if (/reporting summary/i.test(head)) return "reporting"
  if (/supplementary (?:information|materials?|appendix)/i.test(head)) return "information"
  return "other"
}
