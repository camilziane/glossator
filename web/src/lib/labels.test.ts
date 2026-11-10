import { describe, expect, it } from "vitest"

import type { Notice } from "./data"
import {
  isRelevance,
  noticeLabel,
  noticeSentence,
  priorMethod,
  priorWords,
  relevanceDescription,
  relevanceLabel,
  seriousNotice,
} from "./labels"

const notice = (type: string, extra: Partial<Notice> = {}): Notice => ({
  type,
  label: type,
  doi: "10.5555/invented.notice",
  date: "2026-02-03",
  title: `An invented ${type} notice`,
  ...extra,
})

describe("relevance", () => {
  it("has one wording for every page", () => {
    expect(relevanceLabel(3)).toBe("In scope")
    expect(relevanceLabel(2)).toBe("Related")
    expect(relevanceLabel(1)).toBe("Loosely related")
    expect(relevanceLabel(0)).toBe("Unrelated")
    expect(relevanceLabel(null)).toBe("Not rated")
    expect(relevanceLabel(7)).toBe("Relevance 7")
    expect(isRelevance(2)).toBe(true)
    expect(isRelevance(4)).toBe(false)
    expect(isRelevance("2")).toBe(false)
  })

  it("describes a relevance mark for screen readers", () => {
    expect(relevanceDescription(3)).toBe("Relevance 3 of 3: In scope")
    expect(relevanceDescription(0)).toBe("Relevance 0 of 3: Unrelated")
    expect(relevanceDescription(null)).toBe("Relevance: not rated")
    expect(relevanceDescription(undefined)).toBe("Relevance: not rated")
    expect(relevanceDescription(7)).toBe("Relevance 7")
  })

  it("says how the prior scored", () => {
    expect(priorWords("Grassland")).toBe("closest to Grassland")
    expect(priorMethod("similarity")).toBe("by similarity to its articles")
    expect(priorMethod("model")).toBe("by a model trained on past decisions")
    expect(priorMethod("oracle")).toBe("by oracle")
  })
})

describe("notices", () => {
  it("names each kind in words", () => {
    expect(noticeLabel(notice("retraction"))).toBe("Retracted")
    expect(noticeLabel(notice("correction"))).toBe("Corrected")
    expect(noticeSentence(notice("withdrawal"))).toBe("This article was withdrawn")
    expect(noticeLabel(notice("expression_of_concern"))).toBe("Expression of concern")
    expect(noticeLabel(notice("erratum", { label: "Erratum" }))).toBe("Erratum")
    expect(noticeLabel(notice("new_kind", { label: "" }))).toBe("new kind")
    expect(noticeSentence(notice("erratum", { label: "Erratum" }))).toBe(
      "A notice (erratum) was published about this article"
    )
  })

  it("says Notice when a notice has neither a type nor a label", () => {
    expect(noticeLabel(notice("", { label: "" }))).toBe("Notice")
    expect(noticeLabel(notice(" ", { label: " " }))).toBe("Notice")
    expect(noticeSentence(notice("", { label: "" }))).toBe(
      "A notice was published about this article"
    )
  })

  it("finds the notice that puts the findings in doubt", () => {
    expect(seriousNotice([notice("correction"), notice("removal")])?.type).toBe("removal")
    expect(seriousNotice([notice("correction")])).toBeUndefined()
    expect(seriousNotice([])).toBeUndefined()
  })
})
