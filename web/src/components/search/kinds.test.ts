import { describe, expect, it } from "vitest"

import type { SearchHit } from "@/lib/api"
import { indexLibrary } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { queryTerms } from "./highlight"
import { groupHits, hitPlace, type HitPlace } from "./hits"
import {
  authorMatch,
  authorPlace,
  citesTerm,
  holds,
  kindCounts,
  kindGroups,
  kindOf,
  linesOf,
} from "./kinds"

const lib = indexLibrary(fixtureLibrary())

const AUTHORS = {
  authors: "Ingrid Lindqvist, Tomas Herrera, … Ruth Abernathy (12 authors)",
  authors_full: [
    "Ingrid Lindqvist",
    "Tomas Herrera",
    "Mei Nakagawa",
    "Anna van der Berg",
    "Oskar Mbeki",
    "Lea Fontaine",
    "Rafael Quintero",
    "Sun-Hee Park",
    "Daniel Okonkwo",
    "Marta Ruiz",
    "Yusuf Demir",
    "Ruth Abernathy",
  ],
}

function hit(source: string, snippet: string, page: number | null = null): SearchHit {
  const ref = `grassland/lindqvist2026/${source}${page !== null ? `#${page}.0` : ""}`
  return {
    ref,
    bib: "grassland",
    key: "lindqvist2026",
    source,
    page,
    passage: 0,
    cite: "",
    snippet,
  }
}

describe("authorMatch", () => {
  it("finds the author a query names, word for word, and the list's length", () => {
    expect(authorMatch(AUTHORS, ["lindqvist"])).toMatchObject({ index: 0, total: 12 })
    expect(authorMatch(AUTHORS, ["herrera"])).toMatchObject({ index: 1 })
    expect(authorMatch(AUTHORS, ["ingrid lindqvist"])).toMatchObject({ index: 0 })
    expect(authorMatch(AUTHORS, ["berg"])).toMatchObject({ index: 3 })
    expect(authorMatch(AUTHORS, ["lind"])).toBeNull()
    expect(authorMatch(AUTHORS, ["moisture"])).toBeNull()
    // the card's short line, when the full list is not known: its count
    expect(authorMatch({ authors: AUTHORS.authors }, ["abernathy"])).toMatchObject({ total: 12 })
  })

  it("says an author's place as a reader does", () => {
    const at = (index: number, total: number) => authorPlace({ index, total, name: "" })
    expect(at(0, 12)).toBe("1st of 12")
    expect(at(1, 12)).toBe("2nd of 12")
    expect(at(7, 10)).toBe("8th of 10")
    expect(at(11, 12)).toBe("last of 12")
    expect(at(0, 1)).toBe("sole author")
  })
})

describe("citesTerm", () => {
  const terms = ["lindqvist"]
  it("knows a cited name: initials, et al., a year, a list of full names", () => {
    expect(citesTerm("…Herrera, T., Lindqvist, I., Nakagawa, M., …", terms)).toBe(true)
    expect(citesTerm("…Herrera T, Lindqvist I, Nakagawa M et al.", terms)).toBe(true)
    expect(citesTerm("as shown before (Lindqvist et al., 2021; Okafor, 2025)", terms)).toBe(true)
    expect(citesTerm("…in Lindqvist (2024) the probes…", terms)).toBe(true)
    expect(citesTerm("[12] T. Herrera, I. Lindqvist, M. Nakagawa, …", terms)).toBe(true)
    expect(citesTerm("[3] Tomas Herrera, Ingrid Lindqvist, Mei Nakagawa, …", terms)).toBe(true)
  })

  it("leaves the paper's own words, and a word that only looks like a name", () => {
    expect(citesTerm("…contact: lindqvist@northfield.example…", terms)).toBe(false)
    expect(citesTerm("…the Lindqvist grid was buried at 30 cm…", terms)).toBe(false)
    expect(citesTerm("The soil moisture was logged hourly.", ["moisture"])).toBe(false)
  })
})

describe("the kinds of a search's results", () => {
  const entry = lib.article("grassland", "lindqvist2026")!
  const place = (h: SearchHit): HitPlace => hitPlace(h, entry)

  it("sorts each match: author, title, a section of the summary, the paper, a cited work, notes", () => {
    const byAuthor = hit("record:bib", "Ingrid Lindqvist; Tomas Herrera")
    expect(kindOf(byAuthor, place(byAuthor), entry, ["lindqvist"]).key).toBe("author")
    const byTitle = hit("record:bib", "Mapping soil moisture from two invented probe grids")
    expect(kindOf(byTitle, place(byTitle), entry, ["probe"]).key).toBe("title")
    const metric = hit("record:metrics[0]", "name: invented accuracy value: 91%")
    const kind = kindOf(metric, place(metric), entry, ["accuracy"])
    expect(kind.key).toBe("section:metrics")
    expect(kind.label).toBe("Key metrics")
    // the bibliography's profile marks the section
    expect(kind.identity?.family).toBe("results")
    const note = hit("record:curation", "read: every page")
    expect(kindOf(note, place(note), entry, ["page"]).key).toBe("curation")
    const text = hit("paper.pdf", "…the probes were buried at 30 cm…", 4)
    expect(kindOf(text, place(text), entry, ["probes"]).key).toBe("paper")
    const cited = hit("paper.pdf", "…as before (Okafor et al., 2025; Lindqvist et al., 2021)…", 9)
    expect(kindOf(cited, place(cited), entry, ["lindqvist"]).key).toBe("cites")
  })

  it("folds an author's title page into the author's line, counts and filters by kind", () => {
    const terms = queryTerms("Lindqvist")
    const hits = [
      hit("record:bib", "Ingrid Lindqvist; Tomas Herrera"),
      hit("paper.pdf", "Ingrid Lindqvist, Tomas Herrera, Mei Nakagawa, …", 1),
      hit("paper.pdf", "[4] I. Lindqvist, T. Herrera, Probes in clay, 2024.", 12),
      hit("record:curation", "checks: Lindqvist 2026 is the grid study"),
    ]
    const groups = groupHits(hits, lib)
    const places = new Map(hits.map((h) => [h.ref, place(h)]))
    const [group] = kindGroups(groups, places, terms)
    expect(group!.author).toMatchObject({ index: 0, total: 12 })
    // the title page that lists the authors is not a citation
    expect(group!.lines.map((l) => l.kind.key)).toEqual(["author", "cites", "curation"])
    expect(holds(group!, "all") && holds(group!, "cites") && holds(group!, "author")).toBe(true)
    expect(holds(group!, "paper")).toBe(false)
    // curation notes only when asked for
    expect(linesOf(group!, "all").map((l) => l.kind.key)).toEqual(["author", "cites"])
    expect(linesOf(group!, "curation")).toHaveLength(1)
    expect(kindCounts([group!]).map((c) => [c.kind.key, c.articles])).toEqual([
      ["author", 1],
      ["cites", 1],
      ["curation", 1],
    ])
  })
})
