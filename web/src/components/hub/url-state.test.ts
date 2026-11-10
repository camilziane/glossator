import { describe, expect, it } from "vitest"

import { inYearRange, isColumnVisible, parseAsSort, parseAsYearRange } from "./url-state"

describe("sort param", () => {
  it("reads and writes <column>.<direction>", () => {
    expect(parseAsSort.parse("year.desc")).toEqual({ id: "year", desc: true })
    expect(parseAsSort.parse("key-metrics.asc")).toEqual({ id: "key-metrics", desc: false })
    expect(parseAsSort.serialize({ id: "article", desc: false })).toBe("article.asc")
  })

  it("refuses anything else", () => {
    expect(parseAsSort.parse("year")).toBeNull()
    expect(parseAsSort.parse("year.up")).toBeNull()
    expect(parseAsSort.parse("Year.asc")).toBeNull()
    expect(parseAsSort.parse("")).toBeNull()
  })
})

describe("year range param", () => {
  it("reads closed and open ranges", () => {
    expect(parseAsYearRange.parse("2015-2024")).toEqual({ from: 2015, to: 2024 })
    expect(parseAsYearRange.parse("2015-")).toEqual({ from: 2015, to: null })
    expect(parseAsYearRange.parse("-2024")).toEqual({ from: null, to: 2024 })
    expect(parseAsYearRange.parse("2020")).toEqual({ from: 2020, to: 2020 })
  })

  it("swaps reversed bounds and refuses empty or broken ones", () => {
    expect(parseAsYearRange.parse("2024-2015")).toEqual({ from: 2015, to: 2024 })
    expect(parseAsYearRange.parse("-")).toBeNull()
    expect(parseAsYearRange.parse("soon")).toBeNull()
  })

  it("writes what it reads", () => {
    expect(parseAsYearRange.serialize({ from: 2015, to: null })).toBe("2015-")
    expect(parseAsYearRange.serialize({ from: null, to: 2024 })).toBe("-2024")
  })

  it("keeps the years inside, and drops articles without a year once a range is set", () => {
    expect(inYearRange(2020, null)).toBe(true)
    expect(inYearRange(null, null)).toBe(true)
    expect(inYearRange(2020, { from: 2015, to: 2024 })).toBe(true)
    expect(inYearRange(2014, { from: 2015, to: null })).toBe(false)
    expect(inYearRange(2030, { from: null, to: 2024 })).toBe(false)
    expect(inYearRange(null, { from: 2015, to: null })).toBe(false)
  })
})

describe("column visibility in the URL", () => {
  it("lists only the columns that differ from their default", () => {
    expect(isColumnVisible("model", false, [])).toBe(true)
    expect(isColumnVisible("model", false, ["model"])).toBe(false)
    expect(isColumnVisible("tags", true, [])).toBe(false)
    expect(isColumnVisible("tags", true, ["tags"])).toBe(true)
  })
})

describe("tag mode", () => {
  it("keeps all the chosen tags by default, any of them on request", async () => {
    const { articleTableParams } = await import("./url-state")
    expect(articleTableParams.tagmode.parse("any")).toBe("any")
    expect(articleTableParams.tagmode.parse("some")).toBeNull()
    expect(articleTableParams.tagmode.defaultValue).toBe("all")
  })
})
