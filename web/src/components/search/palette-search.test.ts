import { describe, expect, it } from "vitest"

import { indexLibrary } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"

import {
  matchesWords,
  paletteResults,
  searchBibliographies,
  searchInbox,
  shortAuthors,
} from "./palette-search"

const lib = indexLibrary(fixtureLibrary())
const ids = (q: string) => searchInbox(lib, q).map((m) => m.paper.id)

describe("searchInbox", () => {
  it("finds inbox papers by title, author and id, every word required", () => {
    expect(ids("dispersal")).toEqual(["berg2026seeds"])
    expect(ids("ghosh")).toContain("ghosh2026graph")
    expect(ids("graph transformers")).toEqual(["ghosh2026graph"])
    expect(ids("klein2026accepted")).toEqual(["klein2026accepted"])
  })

  it("ignores accents and case and matches prefixes", () => {
    expect(ids("lopez")).toEqual(["lopez2026drenaje"])
    expect(ids("ÍÑIGO pra")).toEqual(["lopez2026drenaje"])
  })

  it("returns nothing for an empty query and respects the limit", () => {
    expect(ids("  ")).toEqual([])
    expect(searchInbox(lib, "invented", 2)).toHaveLength(2)
  })
})

describe("searchBibliographies", () => {
  it("lists every bibliography for nothing, and matches names and titles", () => {
    expect(searchBibliographies(lib, "").map((b) => b.name)).toEqual([
      "grassland",
      "ml",
      "materials",
    ])
    expect(searchBibliographies(lib, "learning").map((b) => b.name)).toEqual(["ml"])
    expect(searchBibliographies(lib, "canopy sens").map((b) => b.name)).toEqual(["grassland"])
  })
})

describe("matchesWords", () => {
  it("wants every word at the start of a word", () => {
    expect(matchesWords("dark th", "Switch to the dark theme")).toBe(true)
    expect(matchesWords("ark", "Switch to the dark theme")).toBe(false)
  })
})

describe("paletteResults", () => {
  it("brings articles, inbox papers and bibliographies together", () => {
    const r = paletteResults(lib, "invented")
    expect(r.articles.length).toBeGreaterThan(0)
    expect(r.articles.length).toBeLessThanOrEqual(8)
    expect(r.inbox.length).toBeLessThanOrEqual(5)
  })
})

describe("shortAuthors", () => {
  it("gives the surnames as a citation does", () => {
    const authors = lib.inbox!.papers.find((p) => p.authors.length > 2)!.authors
    const surname = (name: string) => name.split(/\s+/).at(-1)
    expect(shortAuthors(authors)).toBe(`${surname(authors[0]!)} et al.`)
    expect(shortAuthors(authors.slice(0, 2))).toBe(
      `${surname(authors[0]!)} & ${surname(authors[1]!)}`
    )
    expect(shortAuthors(authors.slice(0, 1))).toBe(surname(authors[0]!))
    expect(shortAuthors([])).toBe("")
  })
})
