import { describe, expect, it } from "vitest"

import { indexLibrary } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"

import { exampleQueries } from "./examples"

describe("exampleQueries", () => {
  it("gives up to three searches whose words two titles of the library share", () => {
    const lib = indexLibrary(fixtureLibrary())
    const titles = lib.articles.map((e) => e.article.title.toLowerCase())
    const examples = exampleQueries(lib)
    expect(examples.length).toBeGreaterThan(0)
    expect(examples.length).toBeLessThanOrEqual(3)
    for (const q of examples) {
      expect(titles.filter((t) => t.includes(q)).length).toBeGreaterThanOrEqual(2)
    }
    // Each brings words of its own.
    const words = examples.flatMap((q) => q.split(" "))
    expect(new Set(words).size).toBe(words.length)
    // The same library, the same examples.
    expect(exampleQueries(lib)).toEqual(examples)
  })

  it("gives nothing for a library without titles in common", () => {
    const data = fixtureLibrary()
    const names = ["Ferns", "Glaciers", "Lanterns"]
    data.bibliographies = data.bibliographies.map((b, i) => ({
      ...b,
      articles: b.articles.slice(0, 1).map((a) => ({ ...a, title: names[i] ?? "Pebbles" })),
    }))
    expect(exampleQueries(indexLibrary(data))).toEqual([])
  })
})
