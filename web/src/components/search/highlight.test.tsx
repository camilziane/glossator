import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Highlight, MarkedText, matchRanges, queryTerms } from "./highlight"

const marked = (text: string, terms: string[]) =>
  matchRanges(text, terms).map(({ start, end }) => text.slice(start, end))

describe("queryTerms", () => {
  it("keeps quoted phrases whole and folds accents and case", () => {
    expect(queryTerms('"Soil Moisture" Über')).toEqual(["soil moisture", "uber"])
  })

  it("drops small words unless nothing else was typed", () => {
    expect(queryTerms("the filter of the array")).toEqual(["filter", "array"])
    expect(queryTerms("the of")).toEqual(["the", "of"])
  })

  it("keeps codes whole and single digits", () => {
    expect(queryTerms("S12 pm2.5 1d-cnn 5")).toEqual(["1d-cnn", "pm2.5", "s12", "5"])
  })
})

describe("matchRanges", () => {
  it("matches at the start of words only, the whole word marked", () => {
    expect(marked("Sensors and biosensors", ["sensor"])).toEqual(["Sensors"])
  })

  it("ignores accents and case, mapping back to the original text", () => {
    expect(marked("Über die Modellvergleiche", ["uber", "modellvergleiche"])).toEqual([
      "Über",
      "Modellvergleiche",
    ])
    expect(marked("Jörg Müller", ["muller"])).toEqual(["Müller"])
  })

  it("joins words marked one after the other", () => {
    expect(marked("a soil moisture model", ["soil", "moisture"])).toEqual(["soil moisture"])
  })

  it("counts the words of the query a mark holds: a phrase found whole is two or more", () => {
    const ranges = matchRanges("the toy filter, then the filter alone", ["toy", "filter"])
    expect(ranges.map((r) => r.words)).toEqual([2, 1])
    expect(matchRanges("a soil moisture", ["soil moisture"])[0]?.words).toBe(2)
  })

  it("finds nothing for no terms or no text", () => {
    expect(matchRanges("", ["x"])).toEqual([])
    expect(matchRanges("text", [])).toEqual([])
  })
})

describe("<Highlight>", () => {
  it("marks matches with <mark> elements and keeps markup in the text as text", () => {
    const { container } = render(
      <p>
        <Highlight text={'<b onclick="x()">Toy</b> filters & toy arrays'} terms={["toy"]} />
      </p>
    )
    const marks = [...container.querySelectorAll("mark")].map((m) => m.textContent)
    expect(marks).toEqual(["Toy", "toy"])
    expect(container.querySelector("b")).toBeNull()
    expect(container.textContent).toBe('<b onclick="x()">Toy</b> filters & toy arrays')
  })

  it("returns the text unchanged when nothing matches", () => {
    const { container } = render(
      <p>
        <Highlight text="nothing here" terms={["filter"]} />
      </p>
    )
    expect(container.querySelector("mark")).toBeNull()
    expect(container.textContent).toBe("nothing here")
  })

  it("draws single words lighter than a phrase found whole when graded", () => {
    const { container } = render(
      <p>
        <Highlight text="the toy filter, then the filter alone" terms={["toy", "filter"]} grade />
      </p>
    )
    expect(
      [...container.querySelectorAll("mark")].map((m) => [m.textContent, m.dataset.match])
    ).toEqual([
      ["toy filter", "strong"],
      ["filter", "light"],
    ])
  })

  it("draws every match strong for a query of one word", () => {
    const { container } = render(
      <p>
        <Highlight text="filter and filters" terms={["filter"]} grade />
      </p>
    )
    expect([...container.querySelectorAll("mark")].map((m) => m.dataset.match)).toEqual([
      "strong",
      "strong",
    ])
  })
})

describe("<MarkedText>", () => {
  it("typesets the text and marks its matches, across an acronym", () => {
    const { container } = render(
      <p>
        <MarkedText text={'the TOY filter... 4-10 "taps"'} terms={["toy filter"]} acronyms />
      </p>
    )
    // The range's dash holds to its figure (a word joiner, U+2060).
    expect(container.textContent).toBe("the TOY filter… 4–\u206010 “taps”")
    expect(container.querySelector("abbr.ac")?.textContent).toBe("TOY")
    // One phrase across the acronym's part and the text after it: marked in both, strong.
    const marks = [...container.querySelectorAll("mark")]
    expect(marks.map((m) => m.textContent).join("")).toBe("TOY filter")
    expect(container.querySelector("abbr mark")?.textContent).toBe("TOY")
  })
})
