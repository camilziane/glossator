import { describe, expect, it } from "vitest"

import type { SearchHit } from "@/lib/api"
import { indexLibrary, plainText, readArticleView, type TableBlock } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"

import { groupHits, hitFromRef, hitPlace, orderedHits, parseRef } from "./hits"

const lib = indexLibrary(fixtureLibrary())

function hit(ref: string, snippet = "A toy passage."): SearchHit {
  const parsed = parseRef(ref)
  if (!parsed) throw new Error(ref)
  return { ref, cite: `${parsed.key} (cite)`, snippet, ...parsed }
}

/** An article's view in the fixture. */
function viewOf(bib: string, key: string) {
  const view = readArticleView(lib.article(bib, key)!.article).view
  if (!view) throw new Error(`${bib}/${key}`)
  return view
}

/** The first table of a section of a fixture article. */
function tableOf(bib: string, key: string, section: string): TableBlock {
  const table = viewOf(bib, key)
    .sections.find((s) => s.id === section)
    ?.blocks.find((b) => b.t === "table")
  if (!table || table.t !== "table") throw new Error(section)
  return table
}

describe("parseRef", () => {
  it("reads file and record references as the server does", () => {
    expect(parseRef("ml/novak2024/paper.pdf#5.2")).toEqual({
      bib: "ml",
      key: "novak2024",
      source: "paper.pdf",
      page: 5,
      passage: 2,
    })
    expect(parseRef("ml/ferreira2025/supplementary/table s1.pdf#3")).toMatchObject({
      source: "supplementary/table s1.pdf",
      page: 3,
      passage: null,
    })
    expect(parseRef("grassland/okafor2025/record:siting")).toMatchObject({
      source: "record:siting",
      page: null,
    })
    expect(parseRef("not a ref")).toBeNull()
  })
})

describe("groupHits", () => {
  it("groups by article in the order of each article's best passage", () => {
    const groups = groupHits(
      [
        hit("ml/novak2024/paper.pdf#2.1"),
        hit("grassland/okafor2025/record:siting"),
        hit("ml/novak2024/paper.pdf#4.3"),
        hit("ml/unknown2020/paper.pdf#1.1"),
      ],
      lib
    )
    expect(groups.map((g) => [g.ref, g.hits.length])).toEqual([
      ["ml/novak2024", 2],
      ["grassland/okafor2025", 1],
      ["ml/unknown2020", 1],
    ])
    expect(groups[0]?.entry?.article.cite).toBe(lib.article("ml", "novak2024")?.article.cite)
    expect(groups[2]?.entry).toBeUndefined()
    // The passages in the order drawn: group by group.
    expect(orderedHits(groups).map((h) => h.ref)).toEqual([
      "ml/novak2024/paper.pdf#2.1",
      "ml/novak2024/paper.pdf#4.3",
      "grassland/okafor2025/record:siting",
      "ml/unknown2020/paper.pdf#1.1",
    ])
  })
})

describe("hitPlace", () => {
  it("opens a paper's passage in the PDF at its page, the page to cite", () => {
    const place = hitPlace(hit("ml/novak2024/paper.pdf#4.3"), lib.article("ml", "novak2024"))
    expect(place).toMatchObject({
      kind: "paper",
      section: null,
      file: null,
      page: { page: 4, text: "p. 4", href: "/library/ml/articles/novak2024/paper.pdf#page=4" },
      fileHref: "/library/ml/articles/novak2024/paper.pdf#page=4",
      // The page a citation points to: the PDF's (citePlace says which page that is in print).
      cite: { page: 4 },
      review: false,
    })
  })

  it("names a supplementary file by what its first page says, when its label says nothing", () => {
    const entry = lib.article("grassland", "lindqvist2026")!
    const file = viewOf("grassland", "lindqvist2026").files.find(
      (f) => f.href.endsWith(".pdf") && f.href.includes("/supplementary/")
    )!
    const source = file.href.slice(file.href.indexOf("supplementary/"))
    const h = hit(`grassland/lindqvist2026/${source}#2.1`)
    expect(hitPlace(h, entry, "information").file?.role).toBe("Supplementary information")
    expect(hitPlace(h, entry, "review")).toMatchObject({
      review: true,
      file: { role: "Referee report" },
      cite: { page: 2, file: "Peer review file" },
    })
  })

  it("names a supplementary file by its name and its role, and encodes its path", () => {
    // The fixture's roles repeat their file names: give one a role of its own.
    const data = fixtureLibrary()
    const article = data.bibliographies
      .find((b) => b.name === "ml")!
      .articles.find((a) => a.key === "ferreira2025")!
    const view = article.view as { files: { href: string; label: string }[] }
    const file = view.files.find((f) => f.href.includes("/supplementary/"))!
    file.label = "Invented role"
    const own = indexLibrary(data)
    const source = file.href.slice(file.href.indexOf("supplementary/"))
    const place = hitPlace(hit(`ml/ferreira2025/${source}#3.1`), own.article("ml", "ferreira2025"))
    expect(place.kind).toBe("supplementary")
    expect(place.file).toEqual({
      name: source.split("/").at(-1),
      role: "Invented role",
      label: "Invented role",
    })
    // A citation names the file by its label.
    expect(place.cite).toEqual({ page: 3, file: "Invented role" })
    // Not a PDF: the file opens as it is (no page to jump to).
    expect(place.page).toMatchObject({ page: 3, doc: "SI", text: "p. 3", href: null })
    expect(place.fileHref).toBe(`/${file.href.split("/").map(encodeURIComponent).join("/")}`)
  })

  it("leaves out a role that only repeats the file's name", () => {
    const entry = lib.article("grassland", "lindqvist2026")!
    const file = viewOf("grassland", "lindqvist2026").files.find((f) => f.href.endsWith(".xlsx"))!
    const source = file.href.slice(file.href.indexOf("supplementary/"))
    expect(hitPlace(hit(`grassland/lindqvist2026/${source}#1.1`), entry).file?.role).toBeNull()
  })

  it("puts a summary's passage at the article's section, by its title", () => {
    const entry = lib.article("grassland", "okafor2025")!
    const section = viewOf("grassland", "okafor2025").sections.find((s) => s.id === "siting")!
    expect(hitPlace(hit("grassland/okafor2025/record:siting"), entry)).toMatchObject({
      kind: "record",
      section: section.title,
      sectionId: "siting",
      fileHref: null,
      metric: null,
    })
  })

  it("reads a metric from the article's own table, its page from the table's source", () => {
    const entry = lib.article("grassland", "okafor2025")!
    const table = tableOf("grassland", "okafor2025", "metrics")
    const row = table.rows[1]!
    const col = (name: string) => plainText(row[table.head.indexOf(name)] ?? [])
    const place = hitPlace(hit("grassland/okafor2025/record:metrics[1]"), entry)
    expect(place.metric).toMatchObject({
      name: col("Metric"),
      value: col("Value"),
      condition: col("Condition"),
      baseline: col("Chance or baseline"),
      source: col("Source"),
    })
    const page = Number(/\d+/.exec(col("Source"))?.[0])
    expect(place.page).toMatchObject({
      page,
      href: `/library/grassland/articles/okafor2025/paper.pdf#page=${page}`,
    })
  })

  it("takes the page a summary's passage names (a quote's where) when it has no table", () => {
    const entry = lib.article("grassland", "okafor2025")!
    const place = hitPlace(
      hit("grassland/okafor2025/record:siting", "…toy words. quotes[0].where: p. 3, Methods…"),
      entry
    )
    expect(place.page).toMatchObject({ page: 3, text: "p. 3" })
  })

  it("names a section the article does not have in words, and opens the article", () => {
    const h = hit("grassland/okafor2025/record:open_questions")
    expect(hitPlace(h, lib.article("grassland", "okafor2025"))).toMatchObject({
      section: "Open questions",
      sectionId: null,
    })
  })
})

describe("hitFromRef", () => {
  it("rebuilds a hit from a shared reference, with the library's citation", () => {
    expect(hitFromRef("ml/novak2024/paper.pdf#2.1", lib)).toMatchObject({
      cite: lib.article("ml", "novak2024")?.article.cite,
      page: 2,
      snippet: "",
    })
    expect(hitFromRef("nope", lib)).toBeNull()
  })
})
