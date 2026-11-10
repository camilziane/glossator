import { screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { indexLibrary, primeLibrary } from "@/lib/data"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { renderWithApp } from "../../../tests/utils/render"

import { notFoundSuggestions, pathSegments, searchQueryFromPath } from "./not-found-data"
import { NotFoundView } from "./not-found-view"

const lib = indexLibrary(fixtureLibrary())

describe("pathSegments and searchQueryFromPath", () => {
  it("decodes the parts and drops index pages", () => {
    expect(pathSegments("/ml/n%C3%A9o/index.html")).toEqual(["ml", "néo"])
    expect(pathSegments("/%E0%A4%A/")).toEqual(["%E0%A4%A"])
  })

  it("turns the last part into words", () => {
    expect(searchQueryFromPath("/notes/soil-moisture_review.html")).toBe("soil moisture review")
    expect(searchQueryFromPath("/")).toBe("")
  })
})

describe("notFoundSuggestions", () => {
  it("finds the article and the bibliography a path names", () => {
    expect(notFoundSuggestions("/ml/novak2024/", lib)).toEqual([
      {
        kind: "article",
        label: "Novak & Ito 2024, Trans. Synth. Signals",
        detail: "ML methods",
        href: "/article/?b=ml&k=novak2024",
      },
      expect.objectContaining({ kind: "bibliography", href: "/bib/?b=ml" }),
    ])
  })

  it("ignores case and finds a key alone", () => {
    expect(notFoundSuggestions("/ML", lib).map((s) => s.href)).toEqual(["/bib/?b=ml"])
    expect(notFoundSuggestions("/papers/Okafor2025", lib).map((s) => s.href)).toEqual([
      "/article/?b=grassland&k=okafor2025",
    ])
  })

  it("suggests nothing for a path that names nothing", () => {
    expect(notFoundSuggestions("/no/such/page/", lib)).toEqual([])
  })
})

describe("NotFoundView", () => {
  afterEach(() => {
    primeLibrary(null)
    window.history.replaceState(null, "", "/")
  })

  it("names the address, the way back and what it may have meant", async () => {
    window.history.replaceState(null, "", "/ml/novak2024/")
    await renderWithApp(<NotFoundView />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found")
    expect(screen.getByText("/ml/novak2024/")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/")
    expect(screen.getByRole("link", { name: /Search for “novak2024”/ })).toHaveAttribute(
      "href",
      "/search/?q=novak2024"
    )
    expect(screen.getByRole("link", { name: /Novak & Ito 2024/ })).toHaveAttribute(
      "href",
      "/article/?b=ml&k=novak2024"
    )
    const bibs = screen.getByRole("navigation", { name: "Bibliographies" })
    expect(bibs.querySelectorAll("a")).toHaveLength(3)
  })
})
