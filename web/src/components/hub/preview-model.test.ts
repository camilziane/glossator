import { describe, expect, it } from "vitest"

import { plainText, readArticleView, resolveHref, type Article } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { metricsTable, previewOf, PREVIEW_METRICS } from "./preview-model"

function articles(): Article[] {
  return fixtureLibrary().bibliographies.flatMap((b) => b.articles)
}

describe("previewOf", () => {
  it("reads the one-liner, the key metrics (headline rows first), the figures and the PDF", () => {
    const article = articles().find((a) => {
      const { view } = readArticleView(a)
      return (
        view &&
        metricsTable(view) &&
        view.sections.some((s) => s.blocks.some((b) => b.t === "figure"))
      )
    })!
    const { view } = readArticleView(article)
    const preview = previewOf(article)
    expect(plainText(preview.lede)).toBe(plainText(view!.lead))

    const { table, section } = metricsTable(view!)!
    expect(preview.metrics?.section).toBe(section)
    const rows = preview.metrics!.rows
    expect(rows.length).toBe(Math.min(PREVIEW_METRICS, table.rows.length))
    const stars = rows.map((r) => r.star)
    expect(stars).toEqual([...stars].sort((a, b) => Number(b) - Number(a)))
    const metricCol = table.head.indexOf("Metric")
    expect(table.rows.map((r) => plainText(r[metricCol]!))).toContain(plainText(rows[0]!.metric))

    const figures = view!.sections.flatMap((s) => s.blocks.filter((b) => b.t === "figure"))
    expect(preview.figures.map((f) => f.src)).toEqual(
      figures.map((f) => (f.t === "figure" ? resolveHref(f.src)?.href : null))
    )
    const pdf = view!.files.find((f) => f.primary)!
    expect(preview.pdf).toBe(resolveHref(pdf.href)!.href)
    expect(preview.error).toBeNull()
  })

  it("names no PDF the record says is still to fetch", () => {
    const article = articles().find((a) =>
      readArticleView(a).view?.files.some((f) => f.primary && /to fetch/i.test(f.label))
    )!
    expect(previewOf(article).pdf).toBeNull()
  })

  it("says why an unreadable record has no preview", () => {
    const article = articles().find((a) => a.error)!
    const preview = previewOf(article)
    expect(preview.error).toBe(article.error)
    expect(preview.metrics).toBeNull()
    expect(preview.figures).toEqual([])
    expect(plainText(preview.lede)).toBe(article.one_line)
  })

  it("is read once per article", () => {
    const article = articles()[0]!
    expect(previewOf(article)).toBe(previewOf(article))
  })
})
