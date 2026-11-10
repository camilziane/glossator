import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Inlines } from "@/lib/data"

import { Kbd } from "@/components/ui/kbd"

import { InlineContent } from "./inline"
import { pageKey, pageRefOf } from "./page-mark"

const NB = String.fromCharCode(0x00a0)
const WJ = String.fromCharCode(0x2060) // a word joiner: the range's dash holds to its figure

function renderParts(parts: Inlines, context?: "text" | "cell") {
  return render(
    <p data-testid="p">
      <InlineContent parts={parts} context={context} />
    </p>
  )
}

describe("InlineContent", () => {
  it("draws text and every mark", () => {
    renderParts([
      "plain ",
      { t: "em", text: "emphasis" },
      { t: "b", text: "strong" },
      { t: "muted", text: "not reported" },
      { t: "todo", text: "TODO check" },
      { t: "badge", text: "draft" },
      { t: "sub", text: "a sub-line" },
    ])
    expect(screen.getByText("emphasis").tagName).toBe("EM")
    expect(screen.getByText("strong").tagName).toBe("STRONG")
    expect(screen.getByText("not reported")).toHaveClass("text-muted-foreground")
    expect(screen.getByText("TODO check")).toHaveClass("text-danger")
    expect(screen.getByText("draft")).toHaveAttribute("data-slot", "badge")
    expect(screen.getByTestId("p")).toHaveTextContent(
      "plain emphasisstrongnot reportedTODO checkdraft a sub-line"
    )
  })

  it("opens web addresses and files in a new tab, safely", () => {
    renderParts([
      { t: "a", href: "https://doi.org/10.5555/x", text: "doi" },
      { t: "a", href: "library/ml/articles/k/paper.pdf", text: "PDF" },
    ])
    const doi = screen.getByRole("link", { name: /doi/ })
    expect(doi).toHaveAttribute("href", "https://doi.org/10.5555/x")
    expect(doi).toHaveAttribute("target", "_blank")
    expect(doi).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getByRole("link", { name: /PDF/ })).toHaveAttribute(
      "href",
      "/library/ml/articles/k/paper.pdf"
    )
  })

  it("links another article to its route", () => {
    renderParts([{ t: "art", bib: "ml", key: "novak2024", text: "Novak & Ito 2024" }])
    expect(screen.getByRole("link", { name: "Novak & Ito 2024" })).toHaveAttribute(
      "href",
      "/article/?b=ml&k=novak2024"
    )
  })

  it("never makes a link of an unsafe href", () => {
    renderParts([{ t: "a", href: "javascript:alert(1)", text: "click" }])
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByText("click")).toBeInTheDocument()
  })

  it("puts a sub-line on its own line in a table cell", () => {
    renderParts(
      [
        { t: "art", bib: "ml", key: "k", text: "Cite" },
        { t: "sub", text: "Title" },
      ],
      "cell"
    )
    expect(screen.getByText("Title")).toHaveClass("block")
  })

  it("typesets text, and marks acronyms in running text only", () => {
    const { container } = renderParts(['A GPU\'s range: 4-10 ms, "inner" loop'])
    // (jest-dom's toHaveTextContent reads no-break spaces as spaces: compare the text itself.)
    expect(container.textContent).toBe(`A GPU’s range: 4–${WJ}10${NB}ms, “inner” loop`)
    expect(container.querySelector("abbr.ac")).toHaveTextContent("GPU")
    const cell = renderParts(["A GPU"], "cell")
    expect(cell.container.querySelector("abbr")).toBeNull()
  })

  it("follows French rules for French text", () => {
    const { container } = render(
      <p>
        <InlineContent parts={["Quand ? 39,48 %"]} lang="fr" />
      </p>
    )
    const nn = String.fromCharCode(0x202f)
    expect(container.textContent).toBe(`Quand${nn}? 39,48${nn}%`)
  })

  it("never typesets a link whose text is an identifier", () => {
    renderParts([
      { t: "a", href: "https://doi.org/10.5555/x-1-2", text: "doi:10.5555/x-1-2" },
      { t: "a", href: "library/ml/articles/k/data-2023-1.csv", text: "data-2023-1.csv" },
      { t: "a", href: "https://example.org/s", text: "Source Data Fig. 3" },
    ])
    expect(screen.getByRole("link", { name: /doi:10\.5555\/x-1-2/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /data-2023-1\.csv/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Source Data Fig\./ }).textContent).toContain(
      `Fig.${NB}3`
    )
  })

  it("draws a page reference as a rubric page mark that opens the PDF", () => {
    renderParts([
      "As shown (",
      { t: "a", href: "library/ml/articles/k/paper.pdf", text: "p. 5" },
      "), see ",
      { t: "a", href: "library/ml/articles/k/paper.pdf", text: "Table 1 (p. 4)" },
      " and ",
      { t: "a", href: "library/ml/articles/k/si.pdf", text: "SI p. 15" },
    ])
    const p5 = screen.getByRole("link", { name: /p\. 5/ })
    expect(p5).toHaveAttribute("data-page", "5")
    expect(p5).toHaveAttribute("href", "/library/ml/articles/k/paper.pdf")
    expect(p5).toHaveClass("text-rubric", "page-mark")
    expect(p5).toHaveAccessibleName(/^p\. 5 ?\(PDF page 5, new tab\)$/)
    const p4 = screen.getByRole("link", { name: /p\. 4/ })
    expect(p4).toHaveTextContent(/^p\. 4/)
    expect(p4.previousSibling?.textContent).toBe(`Table${NB}1 (`)
    expect(screen.getByRole("link", { name: /SI p\. 15/ })).toHaveAttribute("data-page", "SI 15")
  })
})

describe("page references", () => {
  it.each([
    ["p. 5", { before: "", text: "p. 5", after: "", page: 5 }],
    ["pp. 4–10", { before: "", text: "pp. 4–10", after: "", page: 4 }],
    ["pp.4-10", { before: "", text: "pp.4-10", after: "", page: 4 }],
    ["SI p. 15", { before: "", text: "SI p. 15", after: "", page: 15, doc: "SI" }],
    ["Suppl. pp. 2–3", { before: "", text: "Suppl. pp. 2–3", after: "", page: 2, doc: "SI" }],
    ["Table 1 (p. 4)", { before: "Table 1 (", text: "p. 4", after: ")", page: 4 }],
  ])("%j", (text, ref) => {
    expect(pageRefOf(text)).toEqual(ref)
  })

  it.each(["Table 1", "section 3.4", "p. 3.4", "app. 5", "p. 0", "PDF"])(
    "no page in %j",
    (text) => {
      expect(pageRefOf(text)).toBeNull()
    }
  )

  it("keys a page for the pairing of text and gloss", () => {
    expect(pageKey({ page: 5 })).toBe("5")
    expect(pageKey({ page: 15, doc: "SI" })).toBe("SI 15")
  })
})

describe("glyphs no face has", () => {
  it("draws the headline star, its character kept for screen readers and copying", () => {
    const { container } = render(<InlineContent parts={["★ headline metric"]} />)
    expect(container.querySelector("svg")).not.toBeNull()
    expect(container).toHaveTextContent("★ headline metric")
  })

  it("draws the Enter key, named", () => {
    const { container } = render(<Kbd>↵</Kbd>)
    expect(container.querySelector("svg")).not.toBeNull()
    expect(container).toHaveTextContent("Enter")
  })
})
