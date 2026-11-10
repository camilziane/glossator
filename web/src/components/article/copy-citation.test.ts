import { describe, expect, it } from "vitest"

import { referenceParts } from "@/lib/cite"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { metricCitation, quoteCitation } from "./copy-citation"

const base = fixtureLibrary().bibliographies[0]!.articles[0]!
/** The PDF published, its journal page known: PDF p. 5 is the journal's p. 105. */
const journal = { ...base, version: "publishedVersion", journal_offset: 100 }
/** The PDF published, the offset unknown. */
const pdf = { ...base, version: "publishedVersion", journal_offset: null }
const lead = referenceParts(base).lead

describe("quoteCitation", () => {
  it("cites the journal page when the record knows it, in the text and in LaTeX", () => {
    const c = quoteCitation("Some words.", journal, { text: "p. 5", page: 5 }, false)
    expect(c.text).toBe(`“Some words.” (${lead}, p. 105)`)
    expect(c.latex).toBe(`\\cite[p.~105]{${base.key}}`)
  })

  it("says the PDF's page otherwise, as a LaTeX comment", () => {
    const c = quoteCitation("w", pdf, { text: "pp. 4-6", page: 4 }, false)
    expect(c.text).toBe(`“w” (${lead}, PDF pp. 4–6)`)
    expect(c.latex).toBe(`\\cite{${base.key}} % PDF pp. 4–6`)
  })

  it("says a manuscript's page, from the data or from the files", () => {
    const accepted = { ...base, version: "acceptedVersion" }
    expect(quoteCitation("w", accepted, { text: "p. 2", page: 2 }, false).text).toBe(
      `“w” (${lead}, manuscript p. 2)`
    )
    expect(
      quoteCitation("w", { ...base, version: "" }, { text: "p. 2", page: 2 }, true).latex
    ).toBe(`\\cite{${base.key}} % manuscript p. 2`)
  })

  it("names the supplementary information's pages", () => {
    const c = quoteCitation("w", journal, { text: "p. 15", page: 15, doc: "SI" }, true)
    expect(c.text).toBe(`“w” (${lead}, SI p. 15)`)
    expect(c.latex).toBe(`\\cite[SI~p.~15]{${base.key}}`)
  })

  it("cites without a page when the quote has none", () => {
    expect(quoteCitation("w", journal, null, false)).toEqual({
      text: `“w” (${lead})`,
      latex: `\\cite{${base.key}}`,
    })
  })
})

describe("metricCitation", () => {
  it("writes the metric, its value and condition, then the citation", () => {
    const c = metricCitation(
      "accuracy",
      "41.5%",
      "online",
      journal,
      { text: "p. 6", page: 6 },
      false
    )
    expect(c.text).toBe(`accuracy: 41.5%, online (${lead}, p. 106)`)
    expect(c.latex).toBe(`\\cite[p.~106]{${base.key}}`)
    expect(metricCitation("", "12", "", journal, null, false).text).toBe(`12 (${lead})`)
  })
})
