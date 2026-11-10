import { describe, expect, it } from "vitest"

import { defaultRowLines, FULL_UP_TO, isRowLines } from "./use-row-lines"

describe("row lines", () => {
  it("shows a short table whole and a longer one two lines a row", () => {
    expect(defaultRowLines(0)).toBe("full")
    expect(defaultRowLines(FULL_UP_TO)).toBe("full")
    expect(defaultRowLines(FULL_UP_TO + 1)).toBe("2")
  })

  it("reads only the three choices", () => {
    expect(isRowLines("1")).toBe(true)
    expect(isRowLines("full")).toBe(true)
    expect(isRowLines("3")).toBe(false)
    expect(isRowLines(null)).toBe(false)
  })
})
