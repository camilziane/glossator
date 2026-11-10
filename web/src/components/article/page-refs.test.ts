import { describe, expect, it } from "vitest"

import {
  firstPageRef,
  paperPdfHref,
  pdfIsManuscript,
  splitPageRefs,
  type PageRefPiece,
} from "./page-refs"

const pages = (pieces: PageRefPiece[]) =>
  pieces
    .filter((p) => typeof p !== "string" && !p.doc)
    .map((p) => (typeof p === "string" ? [] : [p.text, p.page]))
const si = (pieces: PageRefPiece[]) =>
  pieces
    .filter((p) => typeof p !== "string" && p.doc === "SI")
    .map((p) => (typeof p === "string" ? [] : [p.text, p.page]))

describe("splitPageRefs", () => {
  it("finds single pages and ranges, and keeps the text whole", () => {
    const text = "Source: p. 4 (Results); pp. 10-12, Methods; Fig. 2 (p.7); pp. 3–5"
    const pieces = splitPageRefs(text)
    expect(pages(pieces)).toEqual([
      ["p. 4", 4],
      ["pp. 10-12", 10],
      ["p.7", 7],
      ["pp. 3–5", 3],
    ])
    expect(pieces.map((p) => (typeof p === "string" ? p : p.text)).join("")).toBe(text)
  })

  it("links every page of a rising list", () => {
    expect(pages(splitPageRefs("pp. 2-3, 6, 8-9; Table 1"))).toEqual([
      ["pp. 2-3", 2],
      ["6", 6],
      ["8-9", 8],
    ])
    // a number that does not go on with the pages is not one
    expect(pages(splitPageRefs("pp. 12-13, 2 sessions"))).toEqual([["pp. 12-13", 12]])
  })

  it("leaves section numbers alone", () => {
    expect(pages(splitPageRefs("p. 6, 2.3; p. 3.4"))).toEqual([["p. 6", 6]])
  })

  it("marks pages of the supplementary information, and skips other documents' pages", () => {
    const text =
      "PDF p. 3 (journal p. 401); Table S2 (supplementary p. 9); Supplementary Appendix, pp. 1-20; " +
      "suppl. p. 4; Review File p. 12; supplementary PDF p. 5; arXiv p. 14; main text p. 8"
    expect(pages(splitPageRefs(text))).toEqual([
      ["p. 3", 3],
      ["p. 8", 8],
    ])
    expect(si(splitPageRefs(text))).toEqual([
      ["p. 9", 9],
      ["pp. 1-20", 1],
      ["p. 4", 4],
      ["p. 5", 5],
    ])
  })

  it("reads the supplement's clause, which an aside or a sentence closes", () => {
    const text =
      "Methods, pp. 1-9; Supplementary Information (Tables S1-S2, pp. 1-4); Table 2 (p. 6); " +
      "Fig. 1, p. 3 and Supplementary Fig. 2 (p. 30)"
    expect(pages(splitPageRefs(text))).toEqual([
      ["pp. 1-9", 1],
      ["p. 6", 6],
      ["p. 3", 3],
    ])
    expect(si(splitPageRefs(text))).toEqual([
      ["pp. 1-4", 1],
      ["p. 30", 30],
    ])
    // "(… Supplementary Table 1) at rest. Then (Table 3, p. 7)": the aside is over.
    expect(
      pages(splitPageRefs("noise (Supplementary Table 1) at rest, then Table 3, p. 7. Also p. 9"))
    ).toEqual([
      ["p. 7", 7],
      ["p. 9", 9],
    ])
  })

  it("takes an appendix's pages for the paper's own", () => {
    expect(pages(splitPageRefs("one hidden layer (Appendix B.2, p. 16)"))).toEqual([["p. 16", 16]])
  })

  it("returns plain text untouched", () => {
    expect(splitPageRefs("no pages here, 12 plots")).toEqual(["no pages here, 12 plots"])
    expect(splitPageRefs("")).toEqual([])
  })
})

describe("paperPdfHref", () => {
  const file = (label: string, href = "library/ml/articles/k/paper.pdf", primary = true) => ({
    href,
    label,
    primary,
  })

  it("gives the primary PDF as a served URL", () => {
    expect(paperPdfHref({ files: [file("PDF · preprint")] })).toBe(
      "/library/ml/articles/k/paper.pdf"
    )
  })

  it("has none when the PDF is still to fetch, missing or not a PDF", () => {
    expect(paperPdfHref({ files: [file("PDF · to fetch")] })).toBeNull()
    expect(
      paperPdfHref({ files: [file("record.json", "library/ml/x/record.json", false)] })
    ).toBeNull()
    expect(paperPdfHref({ files: [file("PDF", "library/ml/articles/k/paper.txt")] })).toBeNull()
    expect(paperPdfHref({ files: [file("PDF", "javascript:alert(1)")] })).toBeNull()
  })
})

describe("firstPageRef and pdfIsManuscript", () => {
  it("gives the first page of the paper, else of the SI", () => {
    expect(firstPageRef("Table 2 (supplementary p. 9); p. 4, Results")).toEqual({
      text: "p. 4",
      page: 4,
    })
    expect(firstPageRef("supplementary p. 9")).toEqual({ text: "p. 9", page: 9, doc: "SI" })
    expect(firstPageRef("Fig. 2")).toBeNull()
  })

  it("reads a manuscript from the PDF's label", () => {
    const view = (label: string) => ({
      files: [{ href: "library/ml/articles/k/paper.pdf", label, primary: true }],
    })
    expect(pdfIsManuscript(view("PDF · accepted manuscript"))).toBe(true)
    expect(pdfIsManuscript(view("PDF · published version"))).toBe(false)
  })
})
