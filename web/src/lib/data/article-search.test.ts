import { describe, expect, it } from "vitest"

import { fixtureLibrary } from "../../../tests/utils/fixture"

import { searchArticles } from "./article-search"
import { indexLibrary } from "./model"

describe("searchArticles", () => {
  const lib = indexLibrary(fixtureLibrary())
  const keys = (q: string, bib?: string) =>
    searchArticles(lib, q, { bib }).map((m) => m.entry.article.key)

  it("finds by title, author, citation and tag, every word required", () => {
    expect(keys("moisture")[0]).toBe("lindqvist2026")
    expect(keys("okafor")).toContain("okafor2025")
    expect(keys("novak ito")).toEqual(["novak2024"])
    expect(keys("probe array drainage")).toEqual(["okafor2025"])
  })

  it("ignores accents and case, and matches prefixes", () => {
    expect(keys("uber modellver")).toEqual(["ferreira2025"])
    expect(keys("MÜLLER")).toEqual(["ferreira2025"])
    expect(keys("conv")).toContain("novak2024")
  })

  it("filters by bibliography and returns nothing for nothing", () => {
    expect(keys("architecture", "grassland")).toEqual([])
    expect(keys("architecture", "ml").length).toBeGreaterThan(0)
    expect(keys("   ")).toEqual([])
  })
})
