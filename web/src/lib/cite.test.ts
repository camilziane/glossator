import { describe, expect, it } from "vitest"

import {
  bibtex,
  citePlace,
  escapeLatex,
  formatReference,
  fullReference,
  latexCite,
  parseAuthors,
  quoteWithCitation,
  referenceParts,
  splitName,
  type CiteCard,
} from "./cite"

// Invented cards, in the shapes `glossator build` writes.
const two: CiteCard = {
  key: "novak2024",
  cite: "Novak & Ito 2024, Trans. Synth. Signals",
  title: "A toy convolutional filter for invented field signals",
  authors: "Petra Novák, Haruto Ito",
  year: 2024,
  venue: "Transactions on Synthetic Signals",
  doi: "10.5555/tss.2024.0007",
}

const many: CiteCard = {
  key: "lindqvist2026",
  cite: "Lindqvist et al. 2026, J. Imag. Ecol.",
  title: "Mapping soil moisture from two invented probe grids",
  authors:
    "Ingrid Lindqvist, Tomas Herrera, Mei Nakagawa, Anna van der Berg, … , Ruth Abernathy (12 authors)",
  year: 2026,
  venue: "Journal of Imaginary Ecology",
  doi: "10.5555/jie.2026.0412",
}

const bare: CiteCard = {
  key: "mendes2023",
  cite: "Mendes 2023",
  title: "",
  authors: "",
  year: 2023,
  venue: "",
  doi: "",
}

/** A published article with every reference field, its journal page = PDF page + 1000. */
const full: CiteCard = {
  ...two,
  authors_full: ["Petra Novák", "Haruto Ito", "Jean-Luc Moreau"],
  volume: "12",
  issue: "3",
  pages: "1001-1012",
  version: "publishedVersion",
  journal_offset: 1000,
}

describe("referenceParts", () => {
  it("reads the cite: names, et al., year, venue", () => {
    expect(referenceParts(two)).toEqual({
      names: ["Novak", "Ito"],
      etAl: false,
      year: "2024",
      lead: "Novak & Ito 2024",
      venue: "Trans. Synth. Signals",
    })
    expect(referenceParts(many)).toMatchObject({ names: ["Lindqvist"], etAl: true })
  })

  it("shortens the venue the cite gives", () => {
    expect(
      referenceParts({ ...two, cite: "Novak & Ito 2024, arXiv (Cornell University)", venue: "" })
        .venue
    ).toBe("arXiv")
    expect(
      referenceParts({
        ...two,
        cite: "Novak & Ito 2024, bioRxiv : the preprint server for biology",
      }).venue
    ).toBe("bioRxiv")
    expect(
      referenceParts({ ...two, cite: "Novak & Ito 2024", venue: "arXiv (Cornell University)" })
        .venue
    ).toBe("arXiv")
  })

  it("builds the lead from the authors when the cite cannot be read", () => {
    expect(referenceParts({ ...many, cite: "" }).lead).toBe("Lindqvist et al. 2026")
    expect(referenceParts({ ...two, cite: "?" }).lead).toBe("Novák & Ito 2024")
    expect(referenceParts({ ...bare, cite: "", year: null }).lead).toBe("mendes2023")
  })
})

describe("formatReference (Nature's style)", () => {
  it("names every author up to five, initials after the family name", () => {
    expect(formatReference(full)).toBe(
      "Novák, P., Ito, H. & Moreau, J.-L. A toy convolutional filter for invented field signals. Transactions on Synthetic Signals 12, 1001–1012 (2024)."
    )
    expect(formatReference(two)).toBe(
      "Novák, P. & Ito, H. A toy convolutional filter for invented field signals. Transactions on Synthetic Signals (2024)."
    )
  })

  it("cuts a longer list to the first author et al.", () => {
    expect(formatReference(many)).toBe(
      "Lindqvist, I. et al. Mapping soil moisture from two invented probe grids. Journal of Imaginary Ecology (2026)."
    )
    const six = ["A One", "B Two", "C Three", "D Four", "E Five", "F Six"]
    expect(fullReference({ ...full, authors_full: six }).authors).toBe("One, A. et al.")
  })

  it("keeps a title's own question mark, and does without a venue or authors", () => {
    expect(formatReference({ ...two, title: "Is the filter invented?", venue: "" })).toBe(
      "Novák, P. & Ito, H. Is the filter invented? (2024)."
    )
    expect(formatReference(bare)).toBe("Mendes 2023")
  })

  it("gives the venue apart, for italics", () => {
    expect(fullReference(full)).toEqual({
      authors: "Novák, P., Ito, H. & Moreau, J.-L.",
      title: "A toy convolutional filter for invented field signals.",
      venue: "Transactions on Synthetic Signals",
      tail: " 12, 1001–1012 (2024).",
    })
  })
})

describe("citePlace: one rule for a page", () => {
  it("cites the journal page when the PDF is published and the offset known", () => {
    expect(citePlace(full, { page: 5 })).toEqual({
      words: "p. 1005",
      latex: "\\cite[p.~1005]{novak2024}",
    })
    expect(citePlace(full, { page: "4-6" })).toEqual({
      words: "pp. 1004–1006",
      latex: "\\cite[pp.~1004--1006]{novak2024}",
    })
  })

  it("names a manuscript's page, in a LaTeX comment", () => {
    for (const version of ["acceptedVersion", "submittedVersion"]) {
      expect(citePlace({ ...full, version }, { page: 2 })).toEqual({
        words: "manuscript p. 2",
        latex: "\\cite{novak2024} % manuscript p. 2",
      })
    }
  })

  it("names the PDF's page when the journal's is unknown", () => {
    expect(citePlace({ ...full, journal_offset: null }, { page: 2 })).toEqual({
      words: "PDF p. 2",
      latex: "\\cite{novak2024} % PDF p. 2",
    })
    expect(citePlace(two, { page: "S3" })).toEqual({
      words: "PDF p. S3",
      latex: "\\cite{novak2024} % PDF p. S3",
    })
    // A page that is no number cannot move to the journal's.
    expect(citePlace(full, { page: "S3" }).words).toBe("PDF p. S3")
  })

  it("names a supplementary file by its label", () => {
    expect(citePlace(full, { page: 15, file: "SI 1" })).toEqual({
      words: "SI 1, p. 15",
      latex: "\\cite[SI~1, p.~15]{novak2024}",
    })
    expect(citePlace(full, { page: 15, file: "SI" }).words).toBe("SI p. 15")
    expect(citePlace(full, { page: 2, file: "" })).toEqual({
      words: "suppl. p. 2",
      latex: "\\cite[suppl.~p.~2]{novak2024}",
    })
  })

  it("cites without a page", () => {
    expect(citePlace(full)).toEqual({ words: "", latex: "\\cite{novak2024}" })
    expect(citePlace(full, { page: "" })).toEqual({ words: "", latex: "\\cite{novak2024}" })
  })
})

describe("latexCite", () => {
  it.each([
    [undefined, "\\cite{novak2024}"],
    [null, "\\cite{novak2024}"],
    [5, "\\cite[p.~5]{novak2024}"],
    ["5", "\\cite[p.~5]{novak2024}"],
    ["4–10", "\\cite[pp.~4--10]{novak2024}"],
    ["pp. 4-10", "\\cite[pp.~4--10]{novak2024}"],
    ["S3", "\\cite[p.~S3]{novak2024}"],
    ["", "\\cite{novak2024}"],
  ])("page %j", (page, expected) => {
    expect(latexCite("novak2024", page)).toBe(expected)
  })
})

describe("quoteWithCitation", () => {
  it("puts the words in curly quotes and the citation after them", () => {
    expect(quoteWithCitation("The filter was invented.", full, { page: 5 })).toBe(
      "“The filter was invented.” (Novak & Ito 2024, p. 1005)"
    )
    expect(quoteWithCitation("“Already quoted.”", many, { page: "4-6" })).toBe(
      "“Already quoted.” (Lindqvist et al. 2026, PDF pp. 4–6)"
    )
    expect(quoteWithCitation('"Straight quotes."', two)).toBe(
      "“Straight quotes.” (Novak & Ito 2024)"
    )
  })

  it("says a manuscript's page, and leaves words unquoted on demand", () => {
    expect(quoteWithCitation("Words.", { ...two, version: "acceptedVersion" }, { page: 5 })).toBe(
      "“Words.” (Novak & Ito 2024, manuscript p. 5)"
    )
    expect(quoteWithCitation("accuracy: 41.5%", full, { page: 6 }, { quote: false })).toBe(
      "accuracy: 41.5% (Novak & Ito 2024, p. 1006)"
    )
  })
})

describe("bibtex", () => {
  it("writes a journal article", () => {
    expect(bibtex(two)).toBe(
      [
        "@article{novak2024,",
        "  author = {Novák, Petra and Ito, Haruto},",
        "  title = {{A toy convolutional filter for invented field signals}},",
        "  journal = {Transactions on Synthetic Signals},",
        "  year = {2024},",
        "  doi = {10.5555/tss.2024.0007},",
        "}",
      ].join("\n")
    )
  })

  it("writes every author, the volume, the number and the pages when the card has them", () => {
    expect(bibtex(full)).toBe(
      [
        "@article{novak2024,",
        "  author = {Novák, Petra and Ito, Haruto and Moreau, Jean-Luc},",
        "  title = {{A toy convolutional filter for invented field signals}},",
        "  journal = {Transactions on Synthetic Signals},",
        "  year = {2024},",
        "  volume = {12},",
        "  number = {3},",
        "  pages = {1001--1012},",
        "  doi = {10.5555/tss.2024.0007},",
        "}",
      ].join("\n")
    )
  })

  it("ends a cut author list with 'and others', particles kept with the family name", () => {
    expect(bibtex(many)).toContain(
      "author = {Lindqvist, Ingrid and Herrera, Tomas and Nakagawa, Mei and van der Berg, Anna and others},"
    )
  })

  it("files preprints and proceedings under their own entry types", () => {
    expect(bibtex({ ...two, venue: "arXiv (Cornell University)" })).toMatch(
      /^@misc\{novak2024,[\s\S]*howpublished = \{arXiv\},/
    )
    expect(bibtex({ ...two, venue: "Proceedings of Fictional Engineering" })).toMatch(
      /^@inproceedings\{novak2024,[\s\S]*booktitle = \{Proceedings of Fictional Engineering\},/
    )
  })

  it("leaves out empty fields", () => {
    expect(bibtex(bare)).toBe("@misc{mendes2023,\n  year = {2023},\n}")
  })

  it("escapes LaTeX's special characters, not the DOI", () => {
    const odd = { ...two, title: "50% of R&D in #1 {x}_y", doi: "10.5555/a_b" }
    expect(bibtex(odd)).toContain("title = {{50\\% of R\\&D in \\#1 \\{x\\}\\_y}},")
    expect(bibtex(odd)).toContain("doi = {10.5555/a_b},")
    expect(escapeLatex("a\\b~c^d$")).toBe(
      "a\\textbackslash{}b\\textasciitilde{}c\\textasciicircum{}d\\$"
    )
  })

  it("keeps a consortium whole", () => {
    expect(bibtex({ ...two, authors: "The Invented Modelling Consortium, Haruto Ito" })).toContain(
      "author = {{The Invented Modelling Consortium} and Ito, Haruto},"
    )
  })
})

describe("names", () => {
  it("parses the data's author lists", () => {
    expect(parseAuthors("A B, C D")).toEqual({ names: ["A B", "C D"], truncated: false })
    expect(parseAuthors("A B, … , Y Z (9 authors)")).toEqual({ names: ["A B"], truncated: true })
    expect(parseAuthors("")).toEqual({ names: [], truncated: false })
  })

  it("splits given and family names", () => {
    expect(splitName("Petra Novák")).toEqual({ family: "Novák", given: "Petra" })
    expect(splitName("Kwame N Mensah")).toEqual({ family: "Mensah", given: "Kwame N" })
    expect(splitName("Anna van der Berg")).toEqual({ family: "van der Berg", given: "Anna" })
    expect(splitName("Plato")).toEqual({ family: "Plato", given: "" })
    expect(splitName("Lena Vogt-Herrera")).toEqual({ family: "Vogt-Herrera", given: "Lena" })
  })
})
