import { beforeEach, describe, expect, it } from "vitest"

import {
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
  type RecentSearch,
} from "./recent-searches"

const search = (q: string, more: Partial<RecentSearch> = {}): RecentSearch => ({
  q,
  bib: "",
  scope: "all",
  mode: "hybrid",
  ...more,
})

beforeEach(() => clearRecentSearches())

describe("recent searches", () => {
  it("keeps this tab's searches, the last first, each once", () => {
    rememberSearch(search("toy filter"))
    rememberSearch(search("seeds"))
    rememberSearch(search("Toy filter"))
    expect(readRecentSearches().map((s) => s.q)).toEqual(["Toy filter", "seeds"])
  })

  it("replaces the last search when it was typed on or typed back, not every prefix", () => {
    rememberSearch(search("toy"))
    rememberSearch(search("toy filter"))
    rememberSearch(search("toy fil"))
    expect(readRecentSearches().map((s) => s.q)).toEqual(["toy fil"])
  })

  it("keeps the same words with other filters apart", () => {
    rememberSearch(search("toy filter"))
    rememberSearch(search("toy filter", { scope: "records" }))
    expect(readRecentSearches().map((s) => s.scope)).toEqual(["records", "all"])
  })

  it("skips a search of one letter and keeps eight at most", () => {
    rememberSearch(search("x"))
    expect(readRecentSearches()).toEqual([])
    for (let i = 0; i < 10; i++) rememberSearch(search(`word${i} other`))
    expect(readRecentSearches()).toHaveLength(8)
    expect(readRecentSearches()[0]?.q).toBe("word9 other")
  })

  it("reads nothing from a storage it does not understand", () => {
    window.sessionStorage.setItem("search:recent", "{not json")
    expect(readRecentSearches()).toEqual([])
    window.sessionStorage.setItem("search:recent", JSON.stringify([{ q: 1 }, search("ok words")]))
    expect(readRecentSearches().map((s) => s.q)).toEqual(["ok words"])
  })
})
