/**
 * The Articles table as text to paste elsewhere, of the rows on screen in their order: the table
 * itself (its visible columns), or its headline metrics (one row per ★ metric of each article:
 * metric, value, CI, condition, page). Each as a Markdown table, CSV, or a LaTeX tabularx (booktabs,
 * \small, paragraph columns that share the line's width). Pure: the Copy menu calls it.
 *
 * - Markdown: the Article column is the reference's lead ("Novak & Ito 2024"); text is typeset.
 * - CSV (RFC 4180 quoting, one line per row): the key and the citation first, then the columns as
 *   the data writes them (figures stay figures a spreadsheet can read).
 * - LaTeX: `Novak & Ito~\cite{novak2024}` in the Article column, special characters escaped, the
 *   typographer's signs (×, ±, ≤, en dashes, no-break spaces) as LaTeX writes them.
 * - Pages follow the app's one rule (`citePlace`): the journal's page when it is known, else
 *   "PDF p. 2" or "manuscript p. 2", a supplementary file by its name.
 */
import { pageRefOf } from "@/components/content/page-mark"
import { citePlace, referenceParts, type CiteCard } from "@/lib/cite"
import { plainText, readArticleView, type Inlines } from "@/lib/data"
import { typeset } from "@/lib/typeset"

import { ciBounds, splitCI, type ArticleRow } from "./model"
import { metricsTable } from "./preview-model"

export const EXPORT_FORMATS = ["markdown", "csv", "latex"] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  markdown: "Markdown table",
  csv: "CSV",
  latex: "LaTeX table",
}

export type ExportColumnKind = "article" | "year" | "tags" | "text"

export interface ExportColumn {
  readonly title: string
  readonly kind: ExportColumnKind
  /** Where its cell sits in a row of the data (text columns). */
  readonly index?: number
  readonly numeric?: boolean
}

export interface ExportRow {
  readonly key: string | null
  /** "Novak & Ito 2024": who and when. */
  readonly lead: string
  readonly cite: string
  readonly title: string
  /** One text per column (the Article column's is the lead). */
  readonly cells: readonly string[]
}

export interface ExportTable {
  readonly columns: readonly ExportColumn[]
  readonly rows: readonly ExportRow[]
}

/** A cell's text: its parts in order, a sub-line after a separator. */
export function cellText(parts: Inlines): string {
  let out = ""
  for (const part of parts) {
    if (typeof part !== "string" && part.t === "sub") {
      if (part.text.trim()) out += (out.trim() ? "; " : "") + part.text.trim()
    } else {
      out += typeof part === "string" ? part : part.text
    }
  }
  return out.replace(/\s+/g, " ").trim()
}

/** The table to export: the visible columns of the visible rows, in their order. */
export function exportTable(
  columns: readonly ExportColumn[],
  rows: readonly ArticleRow[]
): ExportTable {
  return {
    columns,
    rows: rows.map((row) => {
      const lead = row.article ? referenceParts(row.article).lead : row.cite || row.key || ""
      return {
        key: row.key,
        lead,
        cite: row.cite,
        title: row.title,
        cells: columns.map((col) => {
          switch (col.kind) {
            case "article":
              return lead
            case "year":
              return row.year === null ? "" : String(row.year)
            case "tags":
              return row.tags.join(", ")
            case "text":
              return cellText(row.cells[col.index ?? -1] ?? [])
          }
        }),
      }
    }),
  }
}

export function exportAs(format: ExportFormat, table: ExportTable): string {
  switch (format) {
    case "markdown":
      return toMarkdown(table)
    case "csv":
      return toCsv(table)
    case "latex":
      return toLatex(table)
  }
}

/** One spelling of the multiplication sign: "4 arrays x 64" → "4 arrays × 64". */
function times(text: string): string {
  return text.replace(/(?<=\S) x (?=[−\d])/gu, " × ")
}

// ---------------------------------------------------------------------------- Markdown

function markdownCell(text: string): string {
  return typeset(times(text))
    .replace(/\u2060/gu, "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
}

export function toMarkdown({ columns, rows }: ExportTable): string {
  const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`
  const head = line(columns.map((c) => markdownCell(c.title)))
  const rule = line(columns.map((c) => (c.numeric || c.kind === "year" ? "---:" : "---")))
  const body = rows.map((r) => line(r.cells.map(markdownCell)))
  return [head, rule, ...body].join("\n") + "\n"
}

// ---------------------------------------------------------------------------- CSV

function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv({ columns, rows }: ExportTable): string {
  const rest = columns.filter((c) => c.kind !== "article")
  const head = ["Key", "Citation", "Title", ...rest.map((c) => c.title)]
  const body = rows.map((r) => [
    r.key ?? "",
    r.cite,
    r.title,
    ...columns.flatMap((c, i) => (c.kind === "article" ? [] : [r.cells[i] ?? ""])),
  ])
  return [head, ...body].map((cells) => cells.map(csvField).join(",")).join("\n") + "\n"
}

// ---------------------------------------------------------------------------- LaTeX

const LATEX: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "\u2060": "",
  " ": "~",
  " ": "\\,",
  " ": "\\,",
  "–": "--",
  "—": "---",
  "−": "$-$",
  "±": "$\\pm$",
  "×": "$\\times$",
  "≈": "$\\approx$",
  "≤": "$\\leq$",
  "≥": "$\\geq$",
  µ: "$\\mu$",
  μ: "$\\mu$",
  "°": "$^\\circ$",
  "→": "$\\to$",
  "²": "$^2$",
  "³": "$^3$",
  "…": "\\dots{}",
  "“": "``",
  "”": "''",
  "‘": "`",
  "’": "'",
  "<": "\\textless{}",
  ">": "\\textgreater{}",
}

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺"
const SUPERSCRIPT_RUN = /([⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)/u

/**
 * Text as LaTeX writes it: specials escaped, typographic signs in their LaTeX form, a superscript
 * (`10⁻⁹`) as math (`10$^{-9}$`), the typesetting's word joiners left out.
 */
export function latexEscape(text: string): string {
  let out = ""
  for (const piece of typeset(times(text)).split(SUPERSCRIPT_RUN)) {
    if (SUPERSCRIPT_RUN.test(piece)) {
      const plain = [...piece].map((c) => "0123456789-+"[SUPERSCRIPTS.indexOf(c)]).join("")
      out += `$^{${plain}}$`
      continue
    }
    for (const ch of piece) out += LATEX[ch] ?? ch
  }
  return out
}

/** `Novak & Ito~\cite{novak2024}`: the names without the year (the citation gives it). */
function latexArticle(row: ExportRow): string {
  if (!row.key) return latexEscape(row.lead)
  const who = row.lead.replace(/\s+(?:1[5-9]|20)\d{2}[a-z]?$/u, "").trim()
  return `${latexEscape(who)}~\\cite{${row.key}}`
}

/** A paragraph column of tabularx, ragged right (it shares the line's width with the others). */
const X = ">{\\raggedright\\arraybackslash}X"

/** A column's alignment: figures right, short words left, long text in a paragraph column. */
function latexColumnSpec(column: ExportColumn, rows: readonly ExportRow[], i: number): string {
  if (column.numeric || column.kind === "year") return "r"
  if (column.kind === "article") return "l"
  const longest = Math.max(0, ...rows.map((r) => (r.cells[i] ?? "").length))
  return longest > 28 ? X : "l"
}

/** A booktabs tabularx as wide as the line, in \small. */
function tabularx(spec: string, head: readonly string[], body: readonly (readonly string[])[]) {
  const line = (cells: readonly string[]) => `  ${cells.join(" & ")} \\\\`
  return [
    "% \\usepackage{booktabs,tabularx}",
    "{\\small",
    `\\begin{tabularx}{\\linewidth}{@{}${spec}@{}}`,
    "  \\toprule",
    line(head),
    "  \\midrule",
    ...body.map(line),
    "  \\bottomrule",
    "\\end{tabularx}",
    "}",
    "",
  ].join("\n")
}

export function toLatex({ columns, rows }: ExportTable): string {
  return tabularx(
    columns.map((c, i) => latexColumnSpec(c, rows, i)).join(""),
    columns.map((c) => latexEscape(c.title)),
    rows.map((r) =>
      columns.map((c, i) =>
        c.kind === "article" ? latexArticle(r) : latexEscape(r.cells[i] ?? "")
      )
    )
  )
}

// ---------------------------------------------------------------------------- headline metrics

export interface MetricRow {
  readonly key: string | null
  readonly cite: string
  /** "Novak & Ito 2024". */
  readonly lead: string
  readonly metric: string
  /** The value without its confidence interval. */
  readonly value: string
  /** The interval's bounds ("7.2–11.2"), "" when the value gives none. */
  readonly ci: string
  readonly condition: string
  /** Where the paper says it, by the app's page rule ("p. 585", "PDF p. 6", "SI p. 15"). */
  readonly page: string
}

/** A record's source cell ("p. 6", "pp. 4–10", "SI p. 15") as the page rule writes it. */
export function sourcePage(card: CiteCard, source: string): string {
  const ref = pageRefOf(source)
  if (!ref) return source.trim()
  const page = ref.text
    .replace(/^(?:SI|Suppl\.?|Supplementary)[\s\u00A0]+/u, "")
    .replace(/^pp?\.[\s\u00A0]?/u, "")
  return citePlace(card, ref.doc ? { page, file: ref.doc } : { page }).words || ref.text
}

/**
 * The headline metrics of the rows (★ in the record; an article without any gives its first),
 * in the rows' order: one line per metric.
 */
export function headlineMetrics(rows: readonly ArticleRow[]): MetricRow[] {
  const out: MetricRow[] = []
  for (const row of rows) {
    const article = row.article
    if (!article) continue
    const { view } = readArticleView(article)
    const found = view ? metricsTable(view) : null
    if (!found) continue
    const head = found.table.head.map((h) => h.trim().toLowerCase())
    const col = (name: string) => head.indexOf(name)
    const [star, metric, value, condition, source] = [
      col("★"),
      col("metric"),
      col("value"),
      col("condition"),
      col("source"),
    ]
    const starred = found.table.rows.filter(
      (cells) => star >= 0 && plainText(cells[star] ?? []).includes("★")
    )
    const chosen = starred.length ? starred : found.table.rows.slice(0, 1)
    const lead = referenceParts(article).lead
    for (const cells of chosen) {
      const text = (i: number) => (i >= 0 ? cellText(cells[i] ?? []) : "")
      const { value: v, ci } = splitCI(text(value))
      out.push({
        key: row.key,
        cite: row.cite,
        lead,
        metric: text(metric),
        value: v,
        ci: ci ? ciBounds(ci) : "",
        condition: text(condition),
        page: source >= 0 ? sourcePage(article, text(source)) : "",
      })
    }
  }
  return out
}

const METRIC_HEAD = ["Metric", "Value", "CI", "Condition", "Page"] as const

function metricCells(m: MetricRow): string[] {
  return [m.metric, m.value, m.ci, m.condition, m.page]
}

export function metricsAs(format: ExportFormat, metrics: readonly MetricRow[]): string {
  switch (format) {
    case "markdown": {
      const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`
      return (
        [
          line(["Article", ...METRIC_HEAD]),
          line(["---", "---", "---:", "---", "---", "---"]),
          ...metrics.map((m) => line([m.lead, ...metricCells(m)].map(markdownCell))),
        ].join("\n") + "\n"
      )
    }
    case "csv":
      return (
        [
          ["Key", "Citation", ...METRIC_HEAD],
          ...metrics.map((m) => [m.key ?? "", m.cite, ...metricCells(m)]),
        ]
          .map((cells) => cells.map(csvField).join(","))
          .join("\n") + "\n"
      )
    case "latex":
      return tabularx(
        `l${X}${X}l${X}l`,
        ["Article", ...METRIC_HEAD].map(latexEscape),
        metrics.map((m) => [
          latexArticle({ key: m.key, lead: m.lead, cite: m.cite, title: "", cells: [] }),
          ...metricCells(m).map(latexEscape),
        ])
      )
  }
}
