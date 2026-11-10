import { describe, expect, it } from "vitest"

import {
  fieldLabel,
  fileKindOf,
  fragmentAround,
  isReviewText,
  parseRecordSnippet,
  parseRecordText,
  quoteSentences,
  tidySnippet,
} from "./snippet"

// Invented words only: the shapes are the server's (an FTS snippet, a flattened record).

describe("tidySnippet", () => {
  it("reads ... as one ellipsis and says where the passage was cut", () => {
    expect(tidySnippet("…the toy filter raises the score…")).toEqual({
      text: "the toy filter raises the score",
      cutStart: true,
      cutEnd: true,
    })
    expect(tidySnippet("The toy filter raises the score...")).toEqual({
      text: "The toy filter raises the score",
      cutStart: false,
      cutEnd: true,
    })
  })

  it("starts at a capital as at a sentence: no leading ellipsis", () => {
    expect(tidySnippet("…Similarly, the toy filter was tuned…")).toMatchObject({
      text: "Similarly, the toy filter was tuned",
      cutStart: false,
    })
  })

  it("drops the sliver of a word the cut left before a capital", () => {
    expect(tidySnippet("…a, Toy filter scores across sessions…")).toMatchObject({
      text: "Toy filter scores across sessions",
      cutStart: false,
    })
  })

  it("moves the start to the next sentence when the words before it hold no match", () => {
    expect(
      tidySnippet("…of the rest. The toy filter raises the score on every session…", ["filter"])
    ).toEqual({
      text: "The toy filter raises the score on every session",
      cutStart: false,
      cutEnd: true,
    })
  })

  it("keeps the cut when the words before the next sentence hold a match", () => {
    expect(
      tidySnippet("…filter taps were set. The score rose on every session…", ["filter"])
    ).toMatchObject({
      text: "filter taps were set. The score rose on every session",
      cutStart: true,
    })
  })

  it("keeps the cut when no sentence starts near", () => {
    expect(tidySnippet("…of the toy filter on every invented session of the set…")).toMatchObject({
      cutStart: true,
    })
  })
})

describe("fieldLabel", () => {
  it("names a field as the article does, never by its raw name", () => {
    expect(fieldLabel("one_line")).toBe("In one line")
    expect(fieldLabel("value")).toBe("Value")
    expect(fieldLabel("baseline")).toBe("Chance or baseline")
    expect(fieldLabel("quotes[1].where")).toBe("Where")
    expect(fieldLabel("architecture")).toBe("Architecture or algorithm")
    expect(fieldLabel("data_source")).toBe("Data sources")
    expect(fieldLabel("same_topic[0].why")).toBe("Why")
  })
})

describe("parseRecordSnippet", () => {
  it("turns flattened `field: value` lines into labelled parts", () => {
    const r = parseRecordSnippet(
      "…toy score value: 12.5% (95% CI 10.1, 14.0) condition: online, toy set source: p. 7…",
      "metrics"
    )
    expect(r.cutStart).toBe(true)
    expect(r.cutEnd).toBe(true)
    expect(r.parts).toEqual([
      // The part the cut started inside: the field before "value" in a metric.
      { field: "name", label: "Metric", text: "toy score" },
      { field: "value", label: "Value", text: "12.5% (95% CI 10.1, 14.0)" },
      { field: "condition", label: "Condition", text: "online, toy set" },
      { field: "source", label: "Source", text: "p. 7" },
    ])
    for (const part of r.parts) expect(part.text).not.toMatch(/\b(?:value|condition|source):/)
  })

  it("labels the one-liner and the abstract", () => {
    const r = parseRecordSnippet("one_line: A toy filter. abstract: More words here.", "overview")
    expect(r.parts.map((p) => [p.label, p.text])).toEqual([
      ["In one line", "A toy filter."],
      ["Abstract", "More words here."],
    ])
  })

  it("names a quote cut at its start from the field that follows it", () => {
    const r = parseRecordSnippet(
      "…between the two toy arrays. quotes[1].where: p. 2, Methods quotes[1].in: this paper…",
      "details"
    )
    expect(r.parts).toEqual([
      { field: "quotes[1].text", label: "Quote", text: "between the two toy arrays." },
      { field: "quotes[1].where", label: "Where", text: "p. 2, Methods" },
    ])
  })

  it("drops a label the cut left without its colon, and a quote's 'in' cut short", () => {
    const r = parseRecordSnippet("…two toy grids, upper quotes[2…", "details")
    expect(r.parts).toEqual([{ field: null, label: null, text: "two toy grids, upper" }])
    expect(r.cutEnd).toBe(true)
    const s = parseRecordSnippet("…toy words quotes[0].where: p. 9 quotes[0].in: this…", "details")
    expect(s.parts.map((p) => p.label)).toEqual(["Quote", "Where"])
  })

  it("reads only the section's own fields as labels", () => {
    const r = parseRecordSnippet(
      "…no toy coordinates; figure: only a sketch of the set…",
      "open_points"
    )
    expect(r.parts).toEqual([
      { field: null, label: null, text: "no toy coordinates; figure: only a sketch of the set" },
    ])
  })
})

describe("parseRecordText", () => {
  it("groups a summary's lines by item, with labels", () => {
    const groups = parseRecordText(
      [
        "problem: Toy arrays drift.",
        "idea: Two toy arrays.",
        "same_topic[0].cite: Novak & Ito 2024",
        "same_topic[0].why: the same toy filter",
        "quotes[0].text: The toy arrays sat apart.",
        "quotes[0].where: p. 4, Methods",
        "quotes[0].in: this paper",
      ].join("\n")
    )
    expect(groups.map((g) => [g.title, g.lines.map((l) => l.label)])).toEqual([
      [null, ["Problem", "Idea"]],
      ["Same topic 1", ["Cite", "Why"]],
      ["Quote 1", ["Quote", "Where"]],
    ])
  })
})

describe("fragmentAround", () => {
  it("cuts a long text at words around its first match", () => {
    const text =
      "A long invented sentence about nothing at all goes on and on until the toy filter appears and then it keeps going for a while after that"
    const f = fragmentAround(text, ["filter"], 60)!
    expect(f.text).toContain("toy filter")
    expect(f.text.length).toBeLessThanOrEqual(60)
    expect(f.cutStart).toBe(true)
    expect(f.cutEnd).toBe(true)
    expect(text).toContain(f.text)
  })

  it("is the whole text when short, and null without a match", () => {
    expect(fragmentAround("A toy filter.", ["filter"])).toEqual({
      text: "A toy filter.",
      cutStart: false,
      cutEnd: false,
    })
    expect(fragmentAround("A toy filter.", ["array"])).toBeNull()
  })
})

describe("fragmentAround on clauses", () => {
  it("cuts on the clause boundaries around the match when they fall within reach", () => {
    const text =
      "An invented study of many toy sessions over a long while; it compares thirteen toy filters (time, frequency, space) on soil, then ranks them by a score nobody uses."
    const f = fragmentAround(text, ["filters"], 70)!
    expect(f.text).toBe("it compares thirteen toy filters (time, frequency, space) on soil")
    expect(f).toMatchObject({ cutStart: true, cutEnd: true })
  })
})

describe("quoteSentences", () => {
  const passage =
    "Text before. The toy set was small, as Fig. 2 shows. The toy filter raises the score on every session. Later work kept it."

  it("gives the whole sentences the snippet touches", () => {
    expect(quoteSentences(passage, "…small, as Fig. 2 shows. The toy filter raises…")).toBe(
      "The toy set was small, as Fig. 2 shows. The toy filter raises the score on every session."
    )
  })

  it("does not end a sentence at an abbreviation", () => {
    expect(quoteSentences(passage, "as Fig. 2 shows")).toBe(
      "The toy set was small, as Fig. 2 shows."
    )
  })

  it("starts a figure's panel as a sentence, without its letter", () => {
    expect(
      quoteSentences(
        "Fig. 3 | Toy results. a, Toy filter scores by session. b, More.",
        "Toy filter scores"
      )
    ).toBe("Toy filter scores by session.")
  })

  it("keeps an ellipsis where the passage itself cuts a sentence", () => {
    expect(quoteSentences("the end of a toy sentence. Next one", "toy sentence")).toBe(
      "…the end of a toy sentence."
    )
    expect(quoteSentences(passage, "the toy words that are not there")).toBeNull()
  })
})

describe("referee reports", () => {
  it("knows a referee report by its first page or its own words", () => {
    expect(fileKindOf("Peer Review File Manuscript Title: A toy filter")).toBe("review")
    expect(fileKindOf("Reviewers' Comments: Reviewer #1: Remarks to the Author: toy")).toBe(
      "review"
    )
    expect(fileKindOf("Reporting Summary The toy journal wishes to improve…")).toBe("reporting")
    expect(fileKindOf("Supplementary information A toy filter")).toBe("information")
    expect(fileKindOf("Table S1. Toy values.")).toBe("other")
    expect(isReviewText("Referee #4 (Remarks to the Author): the toy set")).toBe(true)
    expect(isReviewText("The toy filter raises the score.")).toBe(false)
  })
})
