import { describe, expect, it } from "vitest"

import { plainText, type Bibliography } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import {
  cellTokens,
  ciBounds,
  columnLayout,
  columnSlug,
  columnWidths,
  compareText,
  findMetricsColumn,
  formatYearSpan,
  groupTags,
  hubModel,
  isVagueTag,
  matchesTokens,
  noticeLevel,
  queryTokens,
  rowArticleKey,
  scopeLead,
  splitCI,
  statusLabel,
} from "./model"

function bib(name: string): Bibliography {
  const found = fixtureLibrary().bibliographies.find((b) => b.name === name)
  if (!found) throw new Error(`no ${name} in the fixture`)
  return found
}

describe("hubModel", () => {
  it("keys each Articles row by the article its first cell links to", () => {
    const model = hubModel(bib("grassland"))
    expect(model.articles.rows.map((r) => r.key)).toEqual([
      "lindqvist2026",
      "okafor2025",
      "brandt2024grid",
      "mendes2023",
    ])
    expect(model.articles.rows.map((r) => r.id)).toEqual([
      "lindqvist2026",
      "okafor2025",
      "brandt2024grid",
      "mendes2023",
    ])
    const unreadable = model.articles.rows[3]!
    expect(unreadable.article?.error).toMatch(/KeyError/)
    expect(unreadable.cite).toBe("Mendes 2023")
  })

  it("reads each article's card: year, tags, status and how its notices weigh", () => {
    const rows = hubModel(bib("grassland")).articles.rows
    expect(rows.map((r) => [r.year, r.status, r.notice])).toEqual([
      [2026, "complete", "serious"],
      [2025, "complete", "correction"],
      [2024, "draft", "none"],
      [2023, "complete", "none"],
    ])
    expect(rows[0]!.tags).toContain("Moisture")
  })

  it("names the data's columns by URL-safe ids that never collide with the added ones", () => {
    const model = hubModel(bib("grassland"))
    expect(model.articles.columns.map((c) => c.id)).toEqual([
      "article",
      "sensors",
      "siting",
      "task",
      "model",
      "key-metrics",
    ])
    expect(model.others.map((t) => [t.id, t.columns[0]?.id])).toEqual([
      ["plots", "plot"],
      ["sensors", "sensor-type"],
    ])
  })

  it("searches plain, folded text of the cells and of the card", () => {
    const rows = hubModel(bib("ml")).articles.rows
    const ferreira = rows.find((r) => r.key === "ferreira2025")!
    expect(matchesTokens(ferreira.haystack, queryTokens("UBER modellvergleiche"))).toBe(true)
    expect(matchesTokens(ferreira.haystack, queryTokens("benchmark datasets"))).toBe(true)
    expect(matchesTokens(ferreira.haystack, queryTokens("benchmark attention"))).toBe(false)
  })

  it("counts the facets over the whole bibliography", () => {
    const { facets, stats } = hubModel(bib("grassland"))
    expect(facets.tags.find((t) => t.value === "Probe array")?.count).toBe(2)
    expect(facets.statuses.map((s) => [s.value, s.label, s.count])).toEqual([
      ["complete", "Complete", 3],
      ["draft", "Draft", 1],
    ])
    expect(facets.notices.map((n) => [n.value, n.count])).toEqual([
      ["serious", 1],
      ["correction", 1],
      ["none", 2],
    ])
    expect(facets.years).toEqual([2023, 2026])
    expect(facets.perYear.get(2025)).toBe(1)
    expect(stats).toMatchObject({
      articles: 4,
      complete: 3,
      drafts: 1,
      unreadable: 1,
      flagged: 1,
      corrected: 1,
      years: [2023, 2026],
    })
  })

  it("names each row by its title, its ref and the data's marks", () => {
    const b = bib("grassland")
    const rows = hubModel(b).articles.rows
    for (const row of rows) {
      expect(row.ref).toBe(`${b.name}/${row.key}`)
      const subs = (row.cells[0] ?? []).flatMap((p) =>
        typeof p !== "string" && p.t === "sub" ? [p.text] : []
      )
      expect(row.title).toBe(subs[0] ?? row.article?.title)
      expect(row.place).toBe(subs[1] ?? "")
    }
    const marked = rows.filter((r) => r.badges.length > 0)
    expect(marked.length).toBeGreaterThan(0)
    for (const row of marked) {
      const badges = (row.cells[0] ?? []).flatMap((p) =>
        typeof p !== "string" && p.t === "badge" ? [p.text] : []
      )
      expect(row.badges).toEqual(badges)
    }
  })

  it("says what the flagged articles are", () => {
    const { stats } = hubModel(bib("grassland"))
    expect(stats.flagged).toBe(1)
    expect(stats.flaggedWord).toBe("retracted")
  })

  it("finds the key metrics column, pinned when the table scrolls", () => {
    const model = hubModel(bib("grassland"))
    const metrics = model.articles.columns.find((c) => c.id === model.metricsColumn)
    expect(metrics?.title).toMatch(/metrics|results/i)
    expect(hubModel(bib("ml")).metricsColumn).not.toBeNull()
    expect(
      findMetricsColumn([{ id: "a", title: "Article", index: 0, min: 1, ideal: 1 }])
    ).toBeNull()
  })

  it("groups the tags by the column that writes them, the rest last", () => {
    const b = bib("grassland")
    const model = hubModel(b)
    const groups = model.tagGroups
    const all = groups.flatMap((g) => g.tags.map((t) => t.value))
    expect(new Set(all)).toEqual(new Set(model.facets.tags.map((t) => t.value)))
    expect(all).toHaveLength(model.facets.tags.length)
    const titles = model.articles.columns.map((c) => c.title)
    for (const g of groups) expect(g.label === "Other tags" || titles.includes(g.label!)).toBe(true)
    expect(groups.at(-1)?.label).toBe("Other tags")
    // The first row's sensor cell starts with a tag ("<type>: <count>"): it is in that column.
    const first = model.articles.rows[0]!
    const sensors = model.articles.columns[1]!
    const type = plainText(first.cells[sensors.index] ?? [])
      .split(":")[0]!
      .trim()
    expect(first.tags).toContain(type)
    expect(groups.find((g) => g.tags.some((t) => t.value === type))?.label).toBe(sensors.title)
  })

  it("lists vague tags last and leaves one group unlabelled", () => {
    const rows = hubModel(bib("grassland")).articles.rows.map((r) => ({
      ...r,
      tags: [...r.tags, "Other"],
    }))
    const tags = [
      { value: "Other", label: "Other", count: 9 },
      { value: "Zeta", label: "Zeta", count: 1 },
    ]
    const groups = groupTags(rows, [], tags)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.label).toBeNull()
    expect(groups[0]!.tags.map((t) => t.value)).toEqual(["Zeta", "Other"])
    expect(isVagueTag("Not applicable")).toBe(true)
    expect(isVagueTag("Drainage")).toBe(false)
  })

  it("reads the values a cell lists", () => {
    expect(cellTokens("Alpha · Beta gamma · Delta")).toEqual(
      new Set(["alpha · beta gamma · delta", "alpha", "beta gamma", "delta"])
    )
    expect(cellTokens("Kind: 2").has("kind")).toBe(true)
    expect(cellTokens("").size).toBe(0)
  })

  it("handles an empty bibliography", () => {
    const model = hubModel(bib("materials"))
    expect(model.articles.rows).toEqual([])
    expect(model.facets.years).toBeNull()
    expect(model.stats.years).toBeNull()
    expect(model.others.map((t) => t.id)).toEqual(["kinds"])
  })

  it("is built once per bibliography object", () => {
    const b = bib("ml")
    expect(hubModel(b)).toBe(hubModel(b))
  })
})

describe("column helpers", () => {
  it("slugs titles", () => {
    expect(columnSlug("Key metrics", 0)).toBe("key-metrics")
    expect(columnSlug("Über (n)", 1)).toBe("uber-n")
    expect(columnSlug("★", 2)).toBe("star")
    expect(columnSlug("—", 3)).toBe("col-3")
  })

  it("gives every column a minimum its title fits in and an ideal from its text", () => {
    const [first, short, long] = columnWidths(
      ["Article", "Kind", "Siting"],
      [["A cite and a title", "Kind", "x".repeat(200)]],
      { wideFirst: true }
    )
    // The Article column names the row: a title in the serif and its citation; it wants room.
    expect(first).toEqual({ min: 17, ideal: 28 })
    expect(short).toEqual({ min: 8.5, ideal: 8.5 })
    expect(long!.min).toBe(8.5)
    expect(long!.ideal).toBe(20)
  })

  it("shares the room beyond the minimums by how much more each column wants", () => {
    const cols = [
      { min: 10, ideal: 20 },
      { min: 5, ideal: 5 },
      { min: 8, ideal: 13 },
    ]
    expect(columnLayout(cols, 0)).toEqual({ width: 23, widths: [10, 5, 8] })
    expect(columnLayout(cols, 20)).toEqual({ width: 23, widths: [10, 5, 8] })
    const wide = columnLayout(cols, 38)
    expect(wide.width).toBe(38)
    expect(wide.widths).toEqual([20, 5, 13])
    const none = columnLayout(
      [
        { min: 6, ideal: 6 },
        { min: 2, ideal: 2 },
      ],
      16
    )
    expect(none.widths).toEqual([12, 4])
  })

  it("finds the article a row links to", () => {
    expect(rowArticleKey([[{ t: "art", bib: "b", key: "k1", text: "K" }, "x"]])).toBe("k1")
    expect(rowArticleKey([["plain"]])).toBeNull()
    expect(rowArticleKey([])).toBeNull()
  })
})

describe("confidence intervals", () => {
  it("sets a value's interval apart, in its forms", () => {
    expect(splitCI("9.1% (95% CI 7.2, 11.2)")).toEqual({ value: "9.1%", ci: " (95% CI 7.2, 11.2)" })
    expect(splitCI("24% (CI [18.5, 28.0]) online")).toEqual({
      value: "24% online",
      ci: " (CI [18.5, 28.0])",
    })
    expect(splitCI("0.71, 95% CI 0.6–0.8").value).toBe("0.71")
    expect(splitCI("24% (S12), 14% (S15)")).toEqual({ value: "24% (S12), 14% (S15)", ci: "" })
  })

  it("reads an interval's bounds", () => {
    expect(ciBounds(" (95% CI 7.2, 11.2)")).toBe("7.2–11.2")
    expect(ciBounds(" (CI [18.5, 28.0])")).toBe("18.5–28.0")
    expect(ciBounds(", 95% CI 0.6 to 0.8")).toBe("0.6–0.8")
    expect(ciBounds(" (95% CI intersects chance)")).toBe("intersects chance")
  })
})

describe("scopeLead", () => {
  it("keeps a short scope whole, and says when sentences follow", () => {
    expect(scopeLead("One short sentence.")).toEqual({ lead: "One short sentence.", more: false })
    expect(scopeLead("First sentence here. Then another one.")).toEqual({
      lead: "First sentence here.",
      more: true,
    })
    expect(scopeLead("")).toEqual({ lead: "", more: false })
  })

  it("cuts a long first sentence at a word, never inside a parenthesis", () => {
    const long = `Words ${"and more words ".repeat(6)}(with a parenthesis that runs on and on) and the end.`
    const { lead, more } = scopeLead(long, 100)
    expect(more).toBe(true)
    expect(lead.endsWith("…")).toBe(true)
    expect(lead).not.toContain("(")
    expect(lead.length).toBeLessThanOrEqual(101)
    const words = scopeLead(`${"word ".repeat(40)}end.`, 50).lead
    expect(words).toMatch(/^(word )+word…$/)
  })
})

describe("labels and text", () => {
  it("compares text naturally", () => {
    expect(compareText("Item 2", "Item 10")).toBeLessThan(0)
    expect(compareText("émile", "Emile")).toBe(0)
  })

  it("names statuses and notices", () => {
    expect(statusLabel("being_curated")).toBe("Being curated")
    expect(statusLabel("")).toBe("No status")
    const notice = { type: "retraction", label: "Retraction", doi: "", date: "", title: "" }
    expect(noticeLevel([notice])).toBe("serious")
    expect(noticeLevel([{ ...notice, type: "erratum" }])).toBe("correction")
    expect(noticeLevel([])).toBe("none")
  })

  it("spans years", () => {
    expect(formatYearSpan([2009, 2026])).toBe("2009–2026")
    expect(formatYearSpan([2020, 2020])).toBe("2020")
  })
})
