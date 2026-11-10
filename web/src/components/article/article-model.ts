/**
 * How an article's view becomes the glossed page (pure, tested): the reading order of its sections,
 * each section's blocks cut into what the text column holds and the notes its margin holds, the
 * facts beside the title, the figures, the colophon's line.
 */
import {
  plainText,
  type Block,
  type FigureBlock,
  type GlanceTile,
  type Inlines,
  type Section,
  type TableBlock,
} from "@/lib/data"

/** Column names with a meaning of their own (render.results_blocks). */
export const STAR = "★"
export const VALUE = "Value"

/** The key metrics table: a "★" column and a "Value" column. */
export function isMetricsTable(block: Block): block is TableBlock {
  return block.t === "table" && block.head.includes(STAR) && block.head.includes(VALUE)
}

/** The section of the key metrics (or key results): "metrics" first, else the first with the table. */
export function keyMetricsSection(sections: readonly Section[]): Section | undefined {
  const withTable = sections.filter((s) => s.blocks.some(isMetricsTable))
  return withTable.find((s) => s.id === "metrics") ?? withTable[0]
}

// ---------------------------------------------------------------------------- notes and segments

/** Blocks that go to the margin: the paper's words and where a section's content comes from. */
export function isNote(block: Block): boolean {
  return block.t === "quote" || block.t === "source"
}

/** A table of four columns or more takes the text and the margin. */
export function isWide(block: Block): boolean {
  return block.t === "table" && block.head.length >= 4
}

/**
 * A stretch of a section: text blocks with the notes beside them, or a wide block (a table) across
 * the text and the margin, with the notes that follow it when nothing before can hold them.
 */
export interface Segment {
  wide: boolean
  /** The text column's blocks (one block for a wide segment; none for notes alone). */
  blocks: Block[]
  /** The margin's notes, in order. */
  notes: Block[]
}

/**
 * A section's blocks cut into segments. Notes stay beside the text they follow; a sub-heading starts
 * a segment (each site, each device keeps its own notes); notes after a wide table go beside
 * the text before it (the table pushes the text down, not the notes), or under it when nothing is.
 */
export function segmentBlocks(blocks: readonly Block[]): Segment[] {
  const out: Segment[] = []
  let current: Segment | null = null
  let lastText: Segment | null = null
  for (const block of blocks) {
    if (isNote(block)) {
      if (current && !current.wide) current.notes.push(block)
      else if (current?.wide && lastText) lastText.notes.push(block)
      else if (current?.wide) current.notes.push(block)
      else {
        current = { wide: false, blocks: [], notes: [block] }
        out.push(current)
      }
      continue
    }
    if (isWide(block)) {
      current = { wide: true, blocks: [block], notes: [] }
      out.push(current)
      continue
    }
    // Text: goes on with the current text segment while no note or sub-heading came between.
    if (!current || current.wide || current.notes.length > 0 || block.t === "h3") {
      current = { wide: false, blocks: [], notes: [] }
      out.push(current)
      lastText = current
    }
    current.blocks.push(block)
  }
  return out
}

/** A sub-heading and what follows it, up to the next one (the first group may have no heading). */
export interface Group {
  heading: string | null
  blocks: Block[]
}

export function groupsOf(blocks: readonly Block[]): Group[] {
  const out: Group[] = []
  for (const block of blocks) {
    if (block.t === "h3") out.push({ heading: block.text, blocks: [] })
    else if (out.length === 0) out.push({ heading: null, blocks: [block] })
    else out[out.length - 1]!.blocks.push(block)
  }
  return out
}

/** Sections whose detail is long: three or more groups, each a heading over fields. */
export const COLLAPSE_AFTER = 3

/**
 * Whether a section's groups fold into disclosures (each site, each device): when there are
 * many of them, each a sub-heading over its fields.
 */
export function foldsGroups(section: Section): boolean {
  const groups = groupsOf(section.blocks)
  return (
    groups.length >= COLLAPSE_AFTER &&
    groups.every((g) => g.heading !== null && g.blocks.some((b) => b.t === "fields"))
  )
}

/**
 * A section whose margin is empty (text without notes, not folded): the facts that do not fit beside
 * the title go on there.
 */
export function isQuietSection(section: Section): boolean {
  const { blocks } = section
  return (
    blocks.length > 0 &&
    !isCollapsedSection(section) &&
    !foldsGroups(section) &&
    !blocks.some((b) => isNote(b) || isWide(b)) &&
    !blocks.every((b) => b.t === "quote" || b.t === "h3")
  )
}

/** Sections read on request: where the summary comes from, how it was checked. */
export function isCollapsedSection(section: Section): boolean {
  return section.id === "provenance"
}

// ---------------------------------------------------------------------------- facts

export interface Fact {
  label: string
  lines: Inlines[]
}

/** Facts beside the title: at most this many. */
export const MAX_FACTS = 6

const KEY_RESULTS = /^key (metrics|results)$/i

/**
 * The glance tiles as facts beside the title: the key metrics' tile is left out when the table is on
 * the page (it follows the lede); a line that is only a badge, and a tile's detail lines (those that
 * start muted, after a first line of their own), are left to the sections below.
 */
export function factsOf(glance: readonly GlanceTile[], hasMetrics: boolean): Fact[] {
  const facts: Fact[] = []
  for (const tile of glance) {
    if (hasMetrics && KEY_RESULTS.test(tile.label.trim())) continue
    const lines = tile.lines.filter((line, i) => {
      if (line.length === 0) return false
      if (line.every((p) => typeof p !== "string" && p.t === "badge")) return false
      const first = line[0]
      const detail = i > 0 && typeof first !== "string" && first?.t === "muted"
      return !detail
    })
    if (lines.length > 0 && plainText(lines.flat()).trim()) facts.push({ label: tile.label, lines })
  }
  return facts.slice(0, MAX_FACTS)
}

/** Whether inline parts say something: not empty, not only a muted sentinel ("not reported"). */
export function saysSomething(parts: Inlines): boolean {
  return parts.some((p) =>
    typeof p === "string" ? p.trim() !== "" : p.t !== "muted" && p.text.trim() !== ""
  )
}

/**
 * Whether a fact is a list (each line its own item: plots "**P1** · …"): every line starts
 * with a name in bold or a link. Otherwise its first line is its value.
 */
export function isFactList(fact: Fact): boolean {
  return (
    fact.lines.length > 1 &&
    fact.lines.every((line) => {
      const first = line[0]
      return (
        first !== undefined && typeof first !== "string" && (first.t === "b" || first.t === "art")
      )
    })
  )
}

/** Facts beside the title; the others go on in the margin of the first section without notes. */
export const FACTS_BESIDE_TITLE = 4

/** The facts of the article: the glance tiles' (`factsOf`), then the lab when the record names one. */
export function articleFacts(
  glance: readonly GlanceTile[],
  lab: Inlines,
  hasMetrics: boolean
): Fact[] {
  const facts = factsOf(glance, hasMetrics)
  return facts.length < MAX_FACTS && saysSomething(lab)
    ? [...facts, { label: "Lab", lines: [lab] }]
    : facts
}

/** A value cut for the margin, and whether anything was left out. */
export interface Clause {
  parts: Inlines
  cut: boolean
}

/** About three lines of the gloss beside the title: a single fact's first clause stops there. */
export const FACT_CHARS = 120
/** About one line of the gloss: each line of a list (plots) stops there. */
export const FACT_LINE_CHARS = 46

const TEXT_KINDS = new Set(["em", "b", "muted", "sub"])

/**
 * The first clause of a value, for the margin: up to its first ";" or the end of its first sentence,
 * outside brackets (with `paren`, before its first bracket too), and never longer than `max`
 * characters (cut at a word). The marks it keeps keep their kind; a link is kept whole. `cut`: the
 * margin says "… more".
 */
export function clauseOf(
  parts: Inlines,
  { max = FACT_CHARS, paren = false }: { max?: number; paren?: boolean } = {}
): Clause {
  const out: Inlines = []
  let used = 0
  let depth = 0
  const push = (part: Inlines[number], text: string) => {
    if (typeof part === "string") out.push(text)
    else out.push({ ...part, text } as Inlines[number])
  }
  const finish = (): Clause => {
    // No dangling punctuation before the cut.
    const last = out[out.length - 1]
    const trim = (t: string) => t.replace(/[\s,;:·–—(]+$/u, "")
    if (typeof last === "string") out[out.length - 1] = trim(last)
    else if (last && TEXT_KINDS.has(last.t))
      out[out.length - 1] = { ...last, text: trim(last.text) }
    return { parts: out.filter((p) => p !== ""), cut: true }
  }
  for (const [n, part] of parts.entries()) {
    if (typeof part !== "string" && !TEXT_KINDS.has(part.t)) {
      // A link, a badge: whole or not at all.
      out.push(part)
      used += part.text.length
      if (used >= max && n < parts.length - 1) return finish()
      continue
    }
    const text = typeof part === "string" ? part : part.text
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (depth === 0) {
        const sentence = c === "." && text[i + 1] === " " && /\p{Lu}/u.test(text[i + 2] ?? "")
        const clause = c === ";"
        const bracket = paren && (c === "(" || c === "[") && i > 0
        if (sentence || clause || bracket) {
          push(part, text.slice(0, i))
          return finish()
        }
      }
      if (c === "(" || c === "[") depth++
      else if ((c === ")" || c === "]") && depth > 0) depth--
      if (used + i >= max) {
        // At a word: the last space of this part, else the end of the part before.
        const space = text.lastIndexOf(" ", i)
        if (space > 0) push(part, text.slice(0, space))
        else if (out.length === 0) push(part, text.slice(0, i))
        return finish()
      }
    }
    push(part, text)
    used += text.length
  }
  return { parts: out, cut: false }
}

/** The section a fact's label names ("Siting" → "Sensor siting"), for a link to it. */
export function sectionForLabel(label: string, sections: readonly Section[]): Section | undefined {
  const l = label.trim().toLowerCase()
  if (!l) return undefined
  return (
    sections.find((s) => s.id === l || s.title.toLowerCase() === l) ??
    sections.find((s) => new RegExp(`\\b${escapeRegExp(l)}\\b`).test(s.title.toLowerCase()))
  )
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// ---------------------------------------------------------------------------- figures

export interface FigureRef {
  block: FigureBlock
  /** The section it is in. */
  section: Pick<Section, "id" | "title">
  /** "Fig. 2", "Extended Data Fig. 3", from the caption; else null. */
  name: string | null
}

const FIGURE_NAME =
  /\b((?:Extended Data |Supplementary |Suppl\. )?(?:Fig\.|Figure)\s?S?\d+[A-Za-z]?)/u

/** Every figure of the article, in reading order. */
export function figuresOf(sections: readonly Section[]): FigureRef[] {
  const out: FigureRef[] = []
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.t !== "figure") continue
      const m = FIGURE_NAME.exec(plainText(block.caption)) ?? FIGURE_NAME.exec(block.alt)
      out.push({
        block,
        section: { id: section.id, title: section.title },
        name: m?.[1]?.replace(/^Figure\s?/u, "Fig. ") ?? null,
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------- colophon

export interface Colophon {
  /** "Curated", "Written": the verb of the record's line. */
  verb: string
  /** The day, ISO. */
  date: string
  /** "the curator agent", or "". */
  by: string
  /** What else the footer says (its plumbing sentences left out). */
  rest: string[]
}

/** Sentences of the footer that the colophon says in its own way (the command, the generator). */
const PLUMBING = [/^Generated by\b/i, /^Edit record\.json\b/i]

/** The footer's sentences read: who curated the record and when, and what else it says. */
export function colophonOf(footer: Inlines): Colophon {
  const text = plainText(footer).trim()
  const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/u).filter(Boolean)
  let verb = ""
  let date = ""
  let by = ""
  const rest: string[] = []
  for (const sentence of sentences) {
    const m = /^(\p{Lu}\p{L}+) on (\d{4}-\d{2}-\d{2})(?: by (.+?))?\.?$/u.exec(sentence)
    if (m && !date) {
      verb = m[1] ?? ""
      date = m[2] ?? ""
      by = m[3] ?? ""
    } else if (!PLUMBING.some((re) => re.test(sentence))) {
      rest.push(sentence)
    }
  }
  return { verb, date, by, rest }
}

// ---------------------------------------------------------------------------- headline metrics

export interface HeadlineMetric {
  metric: string
  value: string
}

/** The starred rows of an article's key metrics ("★"), as text: an article link's card shows them. */
export function headlineMetrics(sections: readonly Section[], limit = 3): HeadlineMetric[] {
  const table = keyMetricsSection(sections)?.blocks.find(isMetricsTable)
  if (!table) return []
  const star = table.head.indexOf(STAR)
  const value = table.head.indexOf(VALUE)
  const metric = table.head.findIndex((h) => /^metric$/i.test(h))
  return table.rows
    .filter((row) => plainText(row[star] ?? []).trim() !== "")
    .map((row) => ({
      metric: metric >= 0 ? plainText(row[metric] ?? []).trim() : "",
      value: plainText(row[value] ?? []).trim(),
    }))
    .filter((m) => m.value !== "")
    .slice(0, limit)
}

// ---------------------------------------------------------------------------- key metrics rows

/** Where the key metrics table's meaningful columns are (-1 when it has none). */
export interface MetricColumns {
  star: number
  value: number
  metric: number
  condition: number
  source: number
}

export function metricColumns(head: readonly string[]): MetricColumns {
  const find = (re: RegExp) => head.findIndex((h) => re.test(h.trim()))
  return {
    star: head.indexOf(STAR),
    value: head.indexOf(VALUE),
    metric: find(/^metric$/i),
    condition: find(/^condition$/i),
    source: find(/^source$/i),
  }
}

/** The rows of a key metrics table, headline rows (★) first, the others in their order. */
export function metricRows(table: TableBlock): { cells: Inlines[]; starred: boolean }[] {
  const star = table.head.indexOf(STAR)
  return table.rows
    .map((cells) => ({ cells, starred: star >= 0 && plainText(cells[star] ?? []).trim() !== "" }))
    .sort((a, b) => Number(b.starred) - Number(a.starred))
}

/** A value that starts with a figure ("9.1%", "−3", "≈ 12"), right-aligned in its column. */
export function startsWithFigure(text: string): boolean {
  return /^[−\-+±≈~<>≤≥]?\s?\d/u.test(text.trim())
}

/** "Relative error, online…" → "relative error, online…"; an acronym ("RMSE", "BLEU") stays. */
export function lowerFirst(text: string): string {
  const t = text.trim()
  return /^\p{Lu}\p{Ll}/u.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t
}

/** The width a table across the text and the margin has (≥ 1024 px), in px: about 850–890. */
const TABLE_PX = 880
/** A character of the table's sans (13.5 px at 92 % width), and of its heads (small caps), in px. */
const CELL_CHAR = 7.6
const HEAD_CHAR = 8.5
/** A cell's horizontal padding, in px. */
const CELL_PAD = 20
/** A word longer than this may break inside (an identifier, a path). */
const LONGEST_WORD = 18

function longestWord(text: string): number {
  return Math.max(0, ...text.split(/[\s/]+/u).map((w) => w.length))
}

/**
 * The widths of a table's columns for a fixed layout (the table takes its column's width and wraps,
 * never scrolls), as percentages: each column first gets room for its longest word (its head's, in
 * small caps; a cell's, up to 18 characters), then the rest goes where the cells are long (their
 * third quartile). Null when the words alone do not fit: the table then scrolls.
 */
export function columnWidths(
  head: readonly string[],
  rows: readonly Inlines[][],
  totalPx: number = TABLE_PX
): number[] | null {
  const cols = head.map((h, j) => {
    const texts = rows.map((r) => plainText(r[j] ?? []).trim())
    const lengths = texts.map((t) => t.length).sort((a, b) => a - b)
    const q3 = lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * 0.75))] ?? 0
    const word = Math.min(LONGEST_WORD, Math.max(0, ...texts.map(longestWord)))
    const min = Math.max(longestWord(h) * HEAD_CHAR, word * CELL_CHAR) + CELL_PAD
    const want = Math.max(min, Math.min(60, q3) * CELL_CHAR + CELL_PAD)
    return { min, want }
  })
  const mins = cols.reduce((n, c) => n + c.min, 0)
  if (mins > totalPx) return null
  const extra = cols.reduce((n, c) => n + (c.want - c.min), 0)
  const room = totalPx - mins
  const px = cols.map(
    (c) => c.min + (extra > 0 ? ((c.want - c.min) / extra) * room : room / cols.length)
  )
  return px.map((w) => (w / totalPx) * 100)
}
