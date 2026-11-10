import { describe, expect, it } from "vitest"

import { plainText, readArticleView, type Block, type Section } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import {
  articleFacts,
  clauseOf,
  colophonOf,
  columnWidths,
  isFactList,
  isQuietSection,
  lowerFirst,
  startsWithFigure,
  factsOf,
  figuresOf,
  foldsGroups,
  groupsOf,
  headlineMetrics,
  isMetricsTable,
  keyMetricsSection,
  sectionForLabel,
  segmentBlocks,
  STAR,
} from "./article-model"

/** A view of the synthetic library, by bibliography and key. */
function viewOf(bib: string, key: string) {
  const article = fixtureLibrary()
    .bibliographies.find((b) => b.name === bib)!
    .articles.find((a) => a.key === key)!
  return { article, view: readArticleView(article).view! }
}

const p = (text: string): Block => ({ t: "p", c: [text] })
const quote = (text: string): Block => ({ t: "quote", c: [text], cite: ["p. 2"] })
const source = (text: string): Block => ({ t: "source", c: [text] })
const wide: Block = { t: "table", head: ["A", "B", "C", "D"], rows: [] }
const narrow: Block = { t: "table", head: ["A", "B"], rows: [] }
const h3 = (text: string): Block => ({ t: "h3", text })
const kinds = (blocks: readonly Block[]) => blocks.map((b) => b.t).join(" ")

describe("segmentBlocks", () => {
  it("keeps notes beside the text they follow", () => {
    const segments = segmentBlocks([p("a"), p("b"), quote("q"), source("s"), p("c")])
    expect(segments.map((s) => [s.wide, kinds(s.blocks), kinds(s.notes)])).toEqual([
      [false, "p p", "quote source"],
      [false, "p", ""],
    ])
  })

  it("starts a segment at each sub-heading (a plot, a device)", () => {
    const segments = segmentBlocks([h3("one"), p("a"), source("s"), h3("two"), p("b"), source("t")])
    expect(segments.map((s) => kinds(s.blocks))).toEqual(["h3 p", "h3 p"])
    expect(segments.map((s) => kinds(s.notes))).toEqual(["source", "source"])
  })

  it("puts a wide table across both columns, its notes beside the text before it", () => {
    const segments = segmentBlocks([p("a"), wide, quote("q"), p("b"), source("s")])
    expect(segments.map((s) => [s.wide, kinds(s.blocks), kinds(s.notes)])).toEqual([
      [false, "p", "quote"],
      [true, "table", ""],
      [false, "p", "source"],
    ])
    // a narrow table stays in the text
    expect(segmentBlocks([narrow, source("s")]).map((s) => s.wide)).toEqual([false])
  })

  it("leaves a wide table's notes under it when no text comes before", () => {
    const segments = segmentBlocks([wide, source("s")])
    expect(segments).toHaveLength(1)
    expect(kinds(segments[0]!.notes)).toBe("source")
  })

  it("keeps notes that come first as a segment of their own", () => {
    expect(
      segmentBlocks([quote("q"), p("a")]).map((s) => [kinds(s.blocks), kinds(s.notes)])
    ).toEqual([
      ["", "quote"],
      ["p", ""],
    ])
  })
})

describe("the key metrics", () => {
  it("finds the key metrics' section, and the key results' of another profile", () => {
    const grass = viewOf("grassland", "lindqvist2026").view
    const ml = viewOf("ml", "ashworth2026").view
    const metrics = keyMetricsSection(grass.sections)
    expect(metrics?.id).toBe("metrics")
    expect(metrics?.blocks.some(isMetricsTable)).toBe(true)
    expect(keyMetricsSection(ml.sections)?.blocks.some(isMetricsTable)).toBe(true)
    expect(keyMetricsSection([])).toBeUndefined()
  })

  it("gives the starred rows of an article, as text", () => {
    const { view } = viewOf("grassland", "lindqvist2026")
    const table = keyMetricsSection(view.sections)!.blocks.find(isMetricsTable)!
    const starred = table.rows.filter((r) => plainText(r[table.head.indexOf(STAR)]!).trim())
    const metrics = headlineMetrics(view.sections)
    expect(metrics).toHaveLength(starred.length)
    expect(metrics[0]?.value).toBe(plainText(starred[0]![table.head.indexOf("Value")]!))
    expect(headlineMetrics(view.sections, 1)).toHaveLength(1)
  })
})

describe("factsOf", () => {
  it("lists the glance tiles beside the title, leaving the key metrics to their table", () => {
    const { view } = viewOf("grassland", "lindqvist2026")
    const labels = factsOf(view.glance, true).map((f) => f.label)
    const tiles = view.glance.map((t) => t.label)
    expect(labels).toEqual(tiles.filter((l) => !/^key /i.test(l)))
    // without a key metrics table on the page, its tile is a fact too
    expect(factsOf(view.glance, false).map((f) => f.label)).toEqual(tiles)
  })

  it("leaves out badges and a tile's detail lines", () => {
    const facts = factsOf(
      [
        {
          label: "People",
          lines: [
            [{ t: "b", text: "P1" }, " · one"],
            [{ t: "muted", text: "detail: " }, "more"],
            [{ t: "b", text: "P2" }, " · two"],
          ],
        },
        { label: "Place", lines: [["somewhere"], [{ t: "badge", text: "a badge" }]] },
        { label: "Empty", lines: [] },
      ],
      false
    )
    expect(facts.map((f) => [f.label, f.lines.map(plainText)])).toEqual([
      ["People", ["P1 · one", "P2 · two"]],
      ["Place", ["somewhere"]],
    ])
  })
})

describe("articleFacts", () => {
  it("adds the lab when the record names one and there is room", () => {
    const glance = [{ label: "Task", lines: [["something"]] }]
    expect(articleFacts(glance, ["A lab"], false).map((f) => f.label)).toEqual(["Task", "Lab"])
    expect(
      articleFacts(glance, [{ t: "muted", text: "not reported" }], false).map((f) => f.label)
    ).toEqual(["Task"])
    const six = Array.from({ length: 6 }, (_, i) => ({ label: `T${i}`, lines: [["x"]] }))
    expect(articleFacts(six, ["A lab"], false)).toHaveLength(6)
  })
})

describe("sectionForLabel", () => {
  it("finds the section a fact names, by id, title or a word of the title", () => {
    const sections: Section[] = [
      { id: "task", title: "Task", blocks: [] },
      { id: "siting", title: "Sensor siting", blocks: [] },
    ]
    expect(sectionForLabel("Task", sections)?.id).toBe("task")
    expect(sectionForLabel("Siting", sections)?.id).toBe("siting")
    expect(sectionForLabel("Model", sections)).toBeUndefined()
  })
})

describe("groupsOf and foldsGroups", () => {
  const fields = (label: string): Block => ({ t: "fields", items: [{ label, c: ["x"] }] })

  it("folds three groups or more of a heading over fields", () => {
    const three: Section = {
      id: "plots",
      title: "Plots",
      blocks: [h3("A"), fields("a"), h3("B"), fields("b"), h3("C"), fields("c")],
    }
    expect(groupsOf(three.blocks).map((g) => g.heading)).toEqual(["A", "B", "C"])
    expect(foldsGroups(three)).toBe(true)
    expect(foldsGroups({ ...three, blocks: three.blocks.slice(0, 4) })).toBe(false)
    expect(
      foldsGroups({ ...three, blocks: [h3("A"), p("a"), h3("B"), p("b"), h3("C"), p("c")] })
    ).toBe(false)
  })

  it("starts with a group without a heading when the blocks do", () => {
    expect(groupsOf([p("a"), h3("B"), p("b")]).map((g) => g.heading)).toEqual([null, "B"])
  })
})

describe("figuresOf", () => {
  it("lists the figures in reading order, named from their caption", () => {
    const { view } = viewOf("grassland", "lindqvist2026")
    const figures = figuresOf(view.sections)
    const blocks = view.sections.flatMap((s) => s.blocks.filter((b) => b.t === "figure"))
    expect(figures.map((f) => f.block)).toEqual(blocks)
    expect(figures[0]?.name).toMatch(/^Fig\. \d/)
    expect(figures[0]?.section.id).toBe(
      view.sections.find((s) => s.blocks.includes(blocks[0]!))?.id
    )
  })
})

describe("colophonOf", () => {
  it("reads who curated the record and when, and leaves out the plumbing", () => {
    const { view } = viewOf("grassland", "lindqvist2026")
    const text = plainText(view.footer)
    const colophon = colophonOf(view.footer)
    expect(text).toContain(colophon.date)
    expect(colophon.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(text.startsWith(colophon.verb)).toBe(true)
    expect(text).toContain(colophon.by)
    expect(colophon.rest).toEqual([])
  })

  it("keeps a sentence it does not know", () => {
    expect(colophonOf(["Checked by hand. Generated by a tool."])).toEqual({
      verb: "",
      date: "",
      by: "",
      rest: ["Checked by hand."],
    })
  })
})

describe("clauseOf", () => {
  const text = (parts: ReturnType<typeof clauseOf>["parts"]) => plainText(parts)

  it("keeps a value's first clause, outside brackets", () => {
    const c = clauseOf(["An invented grid (two rows; four columns) on the left; a second one"])
    expect(text(c.parts)).toBe("An invented grid (two rows; four columns) on the left")
    expect(c.cut).toBe(true)
    expect(clauseOf(["One sentence. Another One."]).parts).toEqual(["One sentence"])
    expect(clauseOf(["Short value"])).toEqual({ parts: ["Short value"], cut: false })
  })

  it("stops before a bracket for a list's line, and at a word past its length", () => {
    expect(
      text(clauseOf([{ t: "b", text: "P1" }, " · drought-prone (loam)"], { paren: true }).parts)
    ).toBe("P1 · drought-prone")
    const long = clauseOf(["word ".repeat(40)], { max: 23 })
    expect(text(long.parts)).toBe("word word word word")
    expect(long.cut).toBe(true)
    // a part that does not fit is left out whole, not cut inside a word
    expect(text(clauseOf(["Alpha", " · ", "Betamaxlongword"], { max: 10 }).parts)).toBe("Alpha")
  })

  it("keeps marks and links whole", () => {
    const c = clauseOf([{ t: "b", text: "Invented array" }, ": two grids; more"])
    expect(c.parts).toEqual([{ t: "b", text: "Invented array" }, ": two grids"])
  })
})

describe("isFactList", () => {
  it("is a list when every line starts with a name in bold", () => {
    expect(
      isFactList({ label: "People", lines: [[{ t: "b", text: "P1" }], [{ t: "b", text: "P2" }]] })
    ).toBe(true)
    expect(isFactList({ label: "Task", lines: [["A sentence."], ["tag · tag"]] })).toBe(false)
    expect(isFactList({ label: "One", lines: [[{ t: "b", text: "P1" }]] })).toBe(false)
  })
})

describe("isQuietSection", () => {
  it("is a section of text without notes, tables or folds", () => {
    const quiet: Section = { id: "overview", title: "Overview", blocks: [p("a"), p("b")] }
    expect(isQuietSection(quiet)).toBe(true)
    expect(isQuietSection({ ...quiet, blocks: [p("a"), source("s")] })).toBe(false)
    expect(isQuietSection({ ...quiet, blocks: [wide] })).toBe(false)
    expect(isQuietSection({ ...quiet, id: "provenance" })).toBe(false)
    expect(isQuietSection({ ...quiet, blocks: [quote("q")] })).toBe(false)
  })
})

describe("the key metrics' words", () => {
  it("right-aligns a value that starts with a figure", () => {
    expect(startsWithFigure("4.2%")).toBe(true)
    expect(startsWithFigure("−0.5 dB")).toBe(true)
    expect(startsWithFigure("≈ 12")).toBe(true)
    expect(startsWithFigure("P1 0.31")).toBe(false)
    expect(startsWithFigure("median 4.2%")).toBe(false)
  })

  it("lowers a metric's first letter, not an acronym's", () => {
    expect(lowerFirst("Invented accuracy")).toBe("invented accuracy")
    expect(lowerFirst("WER, online")).toBe("WER, online")
    expect(lowerFirst("speed")).toBe("speed")
  })
})

describe("columnWidths", () => {
  it("gives each column its longest word, the rest where the cells are long", () => {
    const head = ["Name", "Side", "Long description"]
    const rows = [
      [["P1"], ["Left"], ["a long invented sentence about where the grid sits on the surface"]],
      [["P2"], ["Right"], ["another long invented sentence about the same thing"]],
    ]
    const widths = columnWidths(head, rows, 880)!
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100)
    expect(widths[2]!).toBeGreaterThan(widths[0]! + widths[1]!)
    // too many words for the width: the table scrolls instead
    expect(columnWidths(head, rows, 120)).toBeNull()
  })
})
