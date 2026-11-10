import { describe, expect, it } from "vitest"

import { referenceParts } from "@/lib/cite"
import { citePlace } from "@/lib/cite"
import { plainText, readArticleView, type Bibliography } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import {
  cellText,
  exportAs,
  exportTable,
  headlineMetrics,
  latexEscape,
  metricsAs,
  sourcePage,
  toCsv,
  toLatex,
  toMarkdown,
  type ExportColumn,
  type ExportTable,
} from "./export"
import { metricsTable } from "./preview-model"
import { hubModel } from "./model"

function bib(name: string): Bibliography {
  const found = fixtureLibrary().bibliographies.find((b) => b.name === name)
  if (!found) throw new Error(`no ${name} in the fixture`)
  return found
}

/** The fixture's Articles table, every data column visible, Year after the Article. */
function fixtureExport(name = "ml"): { table: ExportTable; model: ReturnType<typeof hubModel> } {
  const model = hubModel(bib(name))
  const [first, ...rest] = model.articles.columns
  const columns: ExportColumn[] = [
    { title: first!.title, kind: "article" },
    { title: "Year", kind: "year", numeric: true },
    ...rest.map((c) => ({ title: c.title, kind: "text" as const, index: c.index })),
  ]
  return { table: exportTable(columns, model.articles.rows), model }
}

/** A small invented table to test the formats' rules on. */
const TINY: ExportTable = {
  columns: [
    { title: "Article", kind: "article" },
    { title: "Year", kind: "year", numeric: true },
    { title: "Note", kind: "text", index: 1 },
  ],
  rows: [
    {
      key: "a2020",
      lead: "Alpha & Beta 2020",
      cite: "Alpha & Beta 2020, Venue",
      title: "A title, with a comma",
      cells: ["Alpha & Beta 2020", "2020", 'pipe | and "quotes" 50% +/- 2'],
    },
    { key: null, lead: "nokey", cite: "nokey", title: "nokey", cells: ["nokey", "", "4 x 64 _x_"] },
  ],
}

describe("exportTable", () => {
  it("takes the visible rows in their order, one text per column", () => {
    const { table, model } = fixtureExport()
    expect(table.rows).toHaveLength(model.articles.rows.length)
    table.rows.forEach((row, i) => {
      const source = model.articles.rows[i]!
      expect(row.key).toBe(source.key)
      expect(row.cells[0]).toBe(referenceParts(source.article!).lead)
      expect(row.cells[1]).toBe(String(source.year))
      expect(row.cells).toHaveLength(table.columns.length)
    })
  })

  it("joins a cell's sub-lines after a separator", () => {
    expect(cellText(["One", { t: "sub", text: "two" }, { t: "b", text: " three" }])).toBe(
      "One; two three"
    )
    expect(cellText([{ t: "sub", text: "alone" }])).toBe("alone")
  })
})

describe("Markdown", () => {
  it("writes a pipe table, figures aligned right", () => {
    const md = toMarkdown(TINY)
    const lines = md.trimEnd().split("\n")
    expect(lines[0]).toBe("| Article | Year | Note |")
    expect(lines[1]).toBe("| --- | ---: | --- |")
    expect(lines).toHaveLength(2 + TINY.rows.length)
    expect(md.endsWith("\n")).toBe(true)
  })

  it("escapes pipes and typesets the text", () => {
    // (typeset joins a sign to its figure with no-break spaces)
    const md = toMarkdown(TINY).replace(/\u00a0/g, " ")
    expect(md).toContain("pipe \\| and “quotes” 50% ± 2")
    expect(md).toContain("4 × 64")
  })

  it("carries the fixture's leads and column titles", () => {
    const { table, model } = fixtureExport()
    const md = exportAs("markdown", table)
    for (const col of model.articles.columns) expect(md).toContain(col.title)
    for (const row of table.rows) expect(md).toContain(row.lead)
  })
})

describe("CSV", () => {
  it("leads with the key, the citation and the title, quoting where it must", () => {
    const csv = toCsv(TINY)
    const lines = csv.trimEnd().split("\n")
    expect(lines[0]).toBe("Key,Citation,Title,Year,Note")
    expect(lines[1]).toBe(
      'a2020,"Alpha & Beta 2020, Venue","A title, with a comma",2020,"pipe | and ""quotes"" 50% +/- 2"'
    )
    expect(lines[2]).toBe(",nokey,nokey,,4 x 64 _x_")
  })

  it("keeps the data as written (figures a spreadsheet reads)", () => {
    const { table } = fixtureExport()
    const csv = toCsv(table)
    for (const row of table.rows) expect(csv).toContain(row.cite.split(",")[0]!)
    expect(csv.split("\n").filter(Boolean)).toHaveLength(table.rows.length + 1)
  })
})

describe("LaTeX", () => {
  it("writes a booktabs tabularx in small type, with a \\cite per article", () => {
    const tex = toLatex(TINY)
    expect(tex).toContain("% \\usepackage{booktabs,tabularx}")
    expect(tex).toContain("{\\small\n")
    // The note runs over 28 characters: a ragged paragraph column sharing the line's width.
    expect(tex).toContain(
      "\\begin{tabularx}{\\linewidth}{@{}lr>{\\raggedright\\arraybackslash}X@{}}"
    )
    expect(tex).toContain("\\toprule")
    expect(tex).toContain("  Article & Year & Note \\\\")
    expect(tex).toContain(
      "Alpha \\& Beta~\\cite{a2020} & 2020 & pipe | and ``quotes'' 50\\%~$\\pm$~2 \\\\"
    )
    expect(tex).toContain("\\bottomrule\n\\end{tabularx}\n}")
    // No key: the lead as text.
    expect(tex).toContain("  nokey &  & 4~$\\times$~64 \\_x\\_ \\\\")
  })

  it("spells the multiplication sign one way", () => {
    expect(latexEscape("4 arrays x 64")).toContain("$\\times$")
    expect(latexEscape("4 arrays x 64")).not.toMatch(/ x /)
    expect(latexEscape("4 x 64")).toBe(latexEscape("4 × 64"))
    expect(
      toMarkdown({ ...TINY, rows: [{ ...TINY.rows[1]!, cells: ["", "", "2 grids x 8"] }] })
    ).toContain("2 grids × 8")
  })

  it("escapes LaTeX's specials and writes the typographer's signs its way", () => {
    expect(latexEscape("50% & $3 #1 _a_ {b} ~ ^ \\")).toBe(
      "50\\% \\& \\$3 \\#1 \\_a\\_ \\{b\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}"
    )
    expect(latexEscape("4-10 ms")).toBe("4--10~ms")
    expect(latexEscape("p = 1.69 × 10-09")).toBe("p~=~1.69~$\\times$~10$^{-9}$")
    expect(latexEscape("an area of 3 mm2")).toBe("an area of 3~mm$^{2}$")
    expect(latexEscape("+/- 2")).toBe("$\\pm$ 2")
    expect(latexEscape("≥ 3 µV")).toContain("$\\geq$")
    expect(latexEscape("a ... b")).toBe("a \\dots{} b")
  })

  it("puts long text in paragraph columns", () => {
    const long: ExportTable = {
      columns: [{ title: "Long", kind: "text", index: 1 }],
      rows: [{ key: "k", lead: "K", cite: "K", title: "T", cells: ["x".repeat(40)] }],
    }
    expect(toLatex(long)).toContain("{@{}>{\\raggedright\\arraybackslash}X@{}}")
  })

  it("cites every fixture article by its key", () => {
    const { table } = fixtureExport("grassland")
    const tex = exportAs("latex", table)
    for (const row of table.rows) {
      if (row.key) expect(tex).toContain(`\\cite{${row.key}}`)
    }
  })
})

describe("headline metrics", () => {
  it("gives one line per ★ metric of each article, in the rows' order", () => {
    const model = hubModel(bib("grassland"))
    const metrics = headlineMetrics(model.articles.rows)
    const expected = model.articles.rows.flatMap((row) => {
      const view = row.article ? readArticleView(row.article).view : null
      const found = view ? metricsTable(view) : null
      if (!found) return []
      const star = found.table.head.indexOf("★")
      const starred = found.table.rows.filter((r) => plainText(r[star] ?? []).includes("★"))
      return (starred.length ? starred : found.table.rows.slice(0, 1)).map(() => row.key)
    })
    expect(metrics.map((m) => m.key)).toEqual(expected)
    expect(metrics.length).toBeGreaterThan(0)
    for (const m of metrics) {
      expect(m.metric).not.toBe("")
      expect(m.value).not.toBe("")
    }
  })

  it("writes each page by the app's one rule", () => {
    const article = hubModel(bib("grassland")).articles.rows[0]!.article!
    expect(sourcePage(article, "p. 6")).toBe(citePlace(article, { page: "6" }).words)
    expect(sourcePage(article, "SI p. 15")).toBe(
      citePlace(article, { page: "15", file: "SI" }).words
    )
    expect(sourcePage(article, "Table 2")).toBe("Table 2")
  })

  it("writes them as Markdown, CSV and a LaTeX tabularx", () => {
    const metrics = headlineMetrics(hubModel(bib("ml")).articles.rows)
    const md = metricsAs("markdown", metrics).trimEnd().split("\n")
    expect(md[0]).toBe("| Article | Metric | Value | CI | Condition | Page |")
    expect(md).toHaveLength(metrics.length + 2)
    const csv = metricsAs("csv", metrics).trimEnd().split("\n")
    expect(csv[0]).toBe("Key,Citation,Metric,Value,CI,Condition,Page")
    expect(csv[1]!.startsWith(`${metrics[0]!.key},`)).toBe(true)
    const tex = metricsAs("latex", metrics)
    expect(tex).toContain("\\begin{tabularx}{\\linewidth}")
    for (const m of metrics) expect(tex).toContain(`\\cite{${m.key}}`)
  })

  it("sets a confidence interval apart from its value", () => {
    const metrics = headlineMetrics(hubModel(bib("grassland")).articles.rows)
    for (const m of metrics) expect(m.value).not.toMatch(/\b(?:CI)\b/)
  })
})
