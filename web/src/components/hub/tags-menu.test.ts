import { describe, expect, it } from "vitest"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { hubModel } from "./model"
import { matchesTags } from "./table-features"
import { tagCounts } from "./tags-menu"

function rows() {
  const bib = fixtureLibrary().bibliographies.find((b) => b.name === "grassland")!
  return hubModel(bib).articles.rows
}

/** Two tags of the fixture that some articles have both of, and some only one. */
function pair() {
  const all = rows()
  const tags = [...new Set(all.flatMap((r) => r.tags))]
  for (const a of tags)
    for (const b of tags) {
      if (a === b) continue
      const both = all.filter((r) => r.tags.includes(a) && r.tags.includes(b)).length
      const either = all.filter((r) => r.tags.includes(a) || r.tags.includes(b)).length
      if (both > 0 && either > both) return { a, b, both, either }
    }
  throw new Error("the fixture has no such pair of tags")
}

describe("tag choices", () => {
  it("keeps the articles having all the tags, or any of them", () => {
    const { a, b, both, either } = pair()
    const all = rows()
    expect(all.filter((r) => matchesTags(r.tags, { tags: [a, b], mode: "all" }))).toHaveLength(both)
    expect(all.filter((r) => matchesTags(r.tags, { tags: [a, b], mode: "any" }))).toHaveLength(
      either
    )
    expect(all.filter((r) => matchesTags(r.tags, { tags: [], mode: "all" }))).toHaveLength(
      all.length
    )
  })

  it("counts what each tag would keep", () => {
    const { a, b, both } = pair()
    const all = rows()
    const any = tagCounts(all, [a], "any")
    expect(any.get(b)).toBe(all.filter((r) => r.tags.includes(b)).length)
    const every = tagCounts(all, [a], "all")
    expect(every.get(b)).toBe(both)
    expect(every.get(a)).toBe(all.filter((r) => r.tags.includes(a)).length)
  })
})
