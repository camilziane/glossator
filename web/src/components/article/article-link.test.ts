import { describe, expect, it } from "vitest"

import { referenceParts } from "@/lib/cite"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { citeShape } from "./article-link"
import { citeCard } from "./inline-pages"

const article = fixtureLibrary().bibliographies[0]!.articles[0]!
const { lead } = referenceParts(article)

describe("citeShape", () => {
  it("draws a key or a cite as the cite line, with the venue when the words name it", () => {
    expect(citeShape(article.key, article)).toBe("bare")
    expect(citeShape(lead, article)).toBe("bare")
    expect(citeShape(article.cite, article)).toBe("venue")
    expect(citeShape(`${lead}, Somewhere`, article)).toBe("venue")
  })

  it("leaves other words as they are", () => {
    expect(citeShape("the follow-up", article)).toBeNull()
    expect(citeShape("", article)).toBeNull()
  })
})

describe("citeCard", () => {
  it("reads words that are a cite", () => {
    const card = citeCard(article.cite)
    expect(card).not.toBeNull()
    expect(referenceParts(card!).lead).toBe(lead)
  })

  it("leaves other words, and words without a year", () => {
    expect(citeCard("an invented sentence about 2024")).toBeNull()
    expect(citeCard("Methods appendix")).toBeNull()
  })
})
