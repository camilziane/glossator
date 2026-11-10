import { describe, expect, it } from "vitest"

import {
  articleFileHref,
  doiHref,
  hitHref,
  libraryHref,
  pdfPageHref,
  recordField,
  resolveHref,
} from "./hrefs"

describe("resolveHref", () => {
  it("keeps web addresses, library files and anchors", () => {
    expect(resolveHref("https://doi.org/10.5555/x")).toEqual({
      kind: "external",
      href: "https://doi.org/10.5555/x",
    })
    expect(resolveHref("http://example.org/a b")).toEqual({
      kind: "external",
      href: "http://example.org/a%20b",
    })
    expect(resolveHref("library/ml/articles/k/supplementary/Data 1.xlsx")).toEqual({
      kind: "file",
      href: "/library/ml/articles/k/supplementary/Data%201.xlsx",
    })
    expect(resolveHref("#siting")).toEqual({ kind: "anchor", href: "#siting" })
  })

  it("refuses anything else", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "JAVASCRIPT:x",
      "/etc/passwd",
      "../x",
      "ftp://x",
      "#",
      "",
      "library/../secret",
      "library/ml/.git/config",
    ]) {
      expect(resolveHref(bad), bad).toBeNull()
    }
  })
})

describe("file links", () => {
  it("encodes each segment", () => {
    expect(libraryHref("library/inbox/pdfs/a#b?.pdf")).toBe("/library/inbox/pdfs/a%23b%3F.pdf")
    expect(articleFileHref("ml", "novak2024", "paper.pdf")).toBe(
      "/library/ml/articles/novak2024/paper.pdf"
    )
  })

  it("opens a PDF at a page, and only a PDF", () => {
    expect(pdfPageHref("/library/x/paper.pdf", 5)).toBe("/library/x/paper.pdf#page=5")
    expect(pdfPageHref("/library/x/paper.pdf", null)).toBe("/library/x/paper.pdf")
    expect(pdfPageHref("/library/x/table.xlsx", 2)).toBe("/library/x/table.xlsx")
  })

  it("links a DOI", () => {
    expect(doiHref("10.5555/abc")).toBe("https://doi.org/10.5555/abc")
    expect(doiHref("https://doi.org/10.5555/abc")).toBe("https://doi.org/10.5555/abc")
    expect(doiHref(" ")).toBeNull()
    // # and ? belong to the DOI: they must not end it.
    expect(doiHref("10.1002/(SICI)1097#x?y")).toBe("https://doi.org/10.1002/(SICI)1097%23x%3Fy")
    expect(doiHref("10.5555/a b<c>")).toBe("https://doi.org/10.5555/a%20b%3Cc%3E")
  })
})

describe("search hits", () => {
  it("names the record field of a record passage", () => {
    expect(recordField("record:siting")).toBe("siting")
    expect(recordField("record:metrics[2]")).toBe("metrics")
    expect(recordField("paper.pdf")).toBeNull()
  })

  it("links a passage to its page or its section", () => {
    const hit = { bib: "ml", key: "novak2024", source: "paper.pdf", page: 3 }
    expect(hitHref(hit)).toBe("/library/ml/articles/novak2024/paper.pdf#page=3")
    expect(
      hitHref({ ...hit, source: "record:open_points", page: null }, ["overview", "open-points"])
    ).toBe("/article/?b=ml&k=novak2024#open-points")
    expect(hitHref({ ...hit, source: "record:bib", page: null }, ["overview"])).toBe(
      "/article/?b=ml&k=novak2024"
    )
  })
})
