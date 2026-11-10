import { describe, expect, it } from "vitest"

import type { SearchHit } from "@/lib/api"
import { referenceParts } from "@/lib/cite"
import { indexLibrary } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"

import { citeForHit, passageWithCitation, passageWords } from "./citing"
import { hitPlace, parseRef } from "./hits"

const lib = indexLibrary(fixtureLibrary())

function hit(ref: string, snippet: string): SearchHit {
  const parsed = parseRef(ref)!
  return { ref, cite: parsed.key, snippet, ...parsed }
}

function card(bib: string, key: string) {
  return lib.article(bib, key)!.article
}

function place(h: SearchHit, kind?: "review") {
  return hitPlace(h, lib.article(h.bib, h.key), kind)
}

// The fixture's cards: lindqvist2026 published with its journal offset, okafor2025 published
// without one, novak2024 an accepted manuscript.
const lindqvist = card("grassland", "lindqvist2026")
const okafor = card("grassland", "okafor2025")
const novak = card("ml", "novak2024")

describe("citeForHit", () => {
  it("cites the journal's page when the record knows it", () => {
    const h = hit("grassland/lindqvist2026/paper.pdf#4.1", "x")
    const journal = 4 + lindqvist.journal_offset!
    expect(citeForHit(lindqvist, place(h))).toBe(`\\cite[p.~${journal}]{lindqvist2026}`)
  })

  it("says the page is the PDF's, or the manuscript's, when it is not the journal's", () => {
    expect(citeForHit(okafor, place(hit("grassland/okafor2025/paper.pdf#4.1", "x")))).toBe(
      "\\cite{okafor2025} % PDF p. 4"
    )
    expect(citeForHit(novak, place(hit("ml/novak2024/paper.pdf#4.1", "x")))).toBe(
      "\\cite{novak2024} % manuscript p. 4"
    )
  })

  it("names the supplementary file, and gives no page without one", () => {
    const h = hit("ml/novak2024/supplementary/s1.pdf#2.1", "x")
    expect(citeForHit(novak, place(h))).toBe("\\cite[suppl.~p.~2]{novak2024}")
    expect(citeForHit(novak, place(hit("ml/novak2024/record:overview", "x")))).toBe(
      "\\cite{novak2024}"
    )
  })
})

describe("passageWords", () => {
  const passage =
    "The set was small. Its first part held the rest of the toy channels. The toy filter raises the score on every session, as the table shows. Later work kept it."

  it("quotes the whole sentences of the passage that hold the snippet, never the index's cut", () => {
    const h = hit(
      "ml/novak2024/paper.pdf#4.1",
      "…of the toy channels. The toy filter raises the score…"
    )
    expect(passageWords(h, place(h), passage)).toBe(
      "Its first part held the rest of the toy channels. The toy filter raises the score on every session, as the table shows."
    )
  })

  it("falls back on the snippet, without its ellipses, until the passage is read", () => {
    const h = hit("ml/novak2024/paper.pdf#4.1", "…the toy filter raises the score…")
    expect(passageWords(h, place(h))).toBe("the toy filter raises the score")
  })

  it("never copies a raw field name of a summary's passage", () => {
    const h = hit(
      "grassland/okafor2025/record:siting",
      "…toy words. quotes[0].where: p. 3, Methods…"
    )
    expect(passageWords(h, place(h))).toBe("toy words. p. 3, Methods")
  })
})

describe("passageWithCitation", () => {
  it("quotes a paper's sentences with the reference and the page by the rule, typeset", () => {
    const h = hit("ml/novak2024/paper.pdf#4.1", 'The "toy" filter raises the score...')
    expect(passageWithCitation(h, place(h), novak)).toBe(
      `“The ‘toy’ filter raises the score” (${referenceParts(novak).lead}, manuscript p. 4)`
    )
  })

  it("copies the words the reader selected instead of the whole passage", () => {
    const h = hit("grassland/okafor2025/paper.pdf#2.1", "The toy arrays sat apart.")
    expect(passageWithCitation(h, place(h), okafor, { selected: " toy arrays " })).toBe(
      `“toy arrays” (${referenceParts(okafor).lead}, PDF p. 2)`
    )
  })

  it("says a referee's words are a referee comment, never the paper's quote", () => {
    const h = hit("ml/novak2024/supplementary/s3.pdf#3.1", "The authors should show the toy set.")
    const text = passageWithCitation(h, place(h, "review"), novak)
    expect(text).toBe(
      `Referee comment on ${referenceParts(novak).lead} (Peer review file, p. 3): “The authors should show the toy set.”`
    )
  })

  it("knows a referee report by its own words, even under a file name that says nothing", () => {
    const h = hit(
      "ml/novak2024/supplementary/s3.pdf#3.1",
      "Reviewer #2 (Remarks to the Author): toy words."
    )
    expect(place(h).review).toBe(true)
    expect(place(h).file?.role).toBe("Referee report")
  })

  it("gives a summary's metric without quote marks: the curator's words, not the paper's", () => {
    const h = hit("grassland/okafor2025/record:metrics[1]", "…value: 0 condition: x…")
    const p = place(h)
    const text = passageWithCitation(h, p, okafor)
    expect(text.startsWith("“")).toBe(false)
    expect(text).toContain(p.metric!.name)
    expect(text).toContain(`(${referenceParts(okafor).lead}, PDF ${p.page!.text})`)
  })
})
