import { describe, expect, it } from "vitest"

import { indexLibrary } from "@/lib/data"
import { routes } from "@/lib/routes"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { listPosition } from "./list-position"

const lib = indexLibrary(fixtureLibrary())
const bib = lib.bibliographies.find((b) => b.articles.length >= 3)!
const keys = bib.articles.map((a) => a.key)
const ref = (key: string) => `${bib.name}/${key}`

describe("listPosition", () => {
  it("pages within the bibliography, newest first, without a list", () => {
    const entry = lib.article(bib.name, keys[1]!)!
    const place = listPosition(lib, entry, "", null)
    expect(place.list).toBeNull()
    expect([place.position, place.count]).toEqual([2, keys.length])
    expect(place.previous?.article.key).toBe(keys[0])
    expect(place.next?.article.key).toBe(keys[2])
    expect(place.back).toBe(routes.bib(bib.name))
  })

  it("pages within the list the reader came from, in its order", () => {
    const from = `/bib/?b=${bib.name}&q=x`
    const order = [ref(keys[2]!), ref(keys[0]!)]
    const place = listPosition(lib, lib.article(bib.name, keys[0]!)!, from, order)
    expect(place.list?.kind).toBe("bib")
    expect([place.position, place.count]).toEqual([2, 2])
    expect(place.previous?.article.key).toBe(keys[2])
    expect(place.next).toBeNull()
    expect(place.back).toBe(from)
  })

  it("falls back to the bibliography when the list does not hold the article", () => {
    const from = "/search/?q=x"
    const place = listPosition(lib, lib.article(bib.name, keys[1]!)!, from, [ref(keys[0]!)])
    expect(place.list).toBeNull()
    expect(place.count).toBe(keys.length)
    // Esc still returns to the list
    expect(place.back).toBe(from)
  })

  it("ignores a `from` that names no list of the app", () => {
    const place = listPosition(lib, lib.article(bib.name, keys[0]!)!, "https://example.org/", null)
    expect(place.back).toBe(routes.bib(bib.name))
  })
})
