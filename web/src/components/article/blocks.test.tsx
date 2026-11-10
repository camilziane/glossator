import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import type { Block, FigureBlock, Section } from "@/lib/data"

import { ArticleProvider, type ArticleContextValue } from "./article-context"
import { figuresOf } from "./article-model"
import { Blocks } from "./blocks"
import { rememberSize } from "./figure-block"
import { FigureLightbox } from "./figure-lightbox"
import { GlossedSection } from "./glossed-section"
import { columnWidth } from "./table-block"

const PDF = "/library/demo/articles/k/paper.pdf"

const CARD = {
  key: "demo2026",
  cite: "Demo et al. 2026, J. Invented",
  title: "An invented title",
  authors: "A Demo, B Other, C Third",
  year: 2026,
  venue: "Journal of the Invented",
  doi: "10.5555/invented",
}

function withArticle(ui: ReactElement, value: Partial<ArticleContextValue> = {}) {
  return (
    <TooltipProvider>
      <ArticleProvider
        value={{
          pdf: PDF,
          card: CARD,
          manuscript: false,
          lookup: null,
          openFigure: null,
          ...value,
        }}
      >
        {ui}
      </ArticleProvider>
    </TooltipProvider>
  )
}

function renderBlocks(blocks: Block[], pdf: string | null = PDF) {
  return render(withArticle(<Blocks blocks={blocks} pdf={pdf} label="Invented results" />))
}

describe("Blocks", () => {
  it("draws prose, sub-headings, bullets and source notes", () => {
    renderBlocks([
      { t: "p", c: ["A first ", { t: "em", text: "invented" }, " paragraph."] },
      { t: "h3", text: "A sub-heading" },
      { t: "bullets", items: [["one point"], ["another point (p. 3)"]] },
      { t: "source", c: ["Source: p. 2, Methods"] },
    ])
    expect(screen.getByText(/A first/).closest("p")).toHaveClass("reading")
    expect(screen.getByRole("heading", { level: 3, name: "A sub-heading" })).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    // a source is a note of pages: its word is said, not shown
    const note = screen.getByText(/Methods/).closest("[data-gloss-note]")
    expect(note).toHaveClass("text-muted-foreground")
    expect(note).toHaveTextContent(/^Source: p\.\s2.*, Methods$/)
    expect(within(note as HTMLElement).getByText("Source:", { exact: false })).toHaveClass(
      "sr-only"
    )
  })

  it("draws fields as a hanging-label list", () => {
    const { container } = renderBlocks([
      {
        t: "fields",
        items: [
          { label: "Goal", c: ["Spell invented words"] },
          { label: "Figure", c: ["Fig. 1, p. 4"] },
        ],
      },
    ])
    const terms = container.querySelectorAll("dl dt")
    expect([...terms].map((t) => t.textContent)).toEqual(["Goal", "Figure"])
    expect(terms[0]).toHaveClass("label")
    expect(container.querySelectorAll("dl dd")[0]).toHaveTextContent("Spell invented words")
  })

  it("marks the pages a source cites: the paper's open its PDF there, the SI's are named", () => {
    renderBlocks([
      { t: "source", c: ["Source: p. 4 (Results); pp. 7-9; journal p. 120; supplementary p. 11"] },
    ])
    const p4 = screen.getByRole("link", { name: /^p\.\s4/ })
    expect(p4).toHaveAttribute("href", `${PDF}#page=4`)
    expect(p4).toHaveAttribute("target", "_blank")
    expect(p4).toHaveAttribute("rel", "noopener noreferrer")
    expect(p4).toHaveAttribute("data-page", "4")
    expect(screen.getByRole("link", { name: /^pp\.\s7–\u20609/ })).toHaveAttribute(
      "href",
      `${PDF}#page=7`
    )
    // another document's numbering is not the PDF's; the SI's page is a mark without a link
    expect(screen.queryByRole("link", { name: /120/ })).toBeNull()
    const si = document.querySelector('[data-page="SI 11"]')
    expect(si?.tagName).toBe("SPAN")
    expect(si).toHaveClass("page-mark")
  })

  it("keeps pages as marks without a PDF, without a link", () => {
    renderBlocks([{ t: "source", c: ["Source: p. 4"] }], null)
    expect(screen.queryByRole("link")).toBeNull()
    expect(document.querySelector('[data-page="4"]')).toHaveClass("page-mark")
  })

  it("draws a quote as a note: its page mark first, and a control that copies it cited", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    renderBlocks([
      {
        t: "quote",
        c: ["Invented words, quoted."],
        cite: ["p. 5, ", { t: "em", text: "Methods" }],
      },
    ])
    const figure = screen.getByRole("figure")
    expect(
      within(figure)
        .getByText(/Invented words, quoted\./)
        .closest("blockquote")
    ).not.toBeNull()
    expect(within(figure).getByRole("link", { name: /p\.\s5/ })).toHaveAttribute(
      "href",
      `${PDF}#page=5`
    )
    expect(figure.querySelector("figcaption")).toHaveTextContent(/^p\.\s5.* · Methods/)
    const copy = within(figure).getByRole("button", { name: "Copy the quote with its citation" })
    expect(copy).toHaveAttribute("aria-keyshortcuts", "y Shift+Y")
    await user.click(copy)
    // a PDF whose journal pages are not known: its page is said to be the PDF's
    expect(writeText).toHaveBeenLastCalledWith(
      expect.stringMatching(/^“Invented words, quoted\.” \(Demo et al\. 2026, PDF p\. 5\)$/)
    )
    // Shift copies the LaTeX citation
    await user.keyboard("{Shift>}")
    await user.click(copy)
    await user.keyboard("{/Shift}")
    expect(writeText).toHaveBeenLastCalledWith("\\cite{demo2026} % PDF p. 5")
  })

  it("cites a quote at the journal's page when the record knows it", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(
      withArticle(
        <Blocks blocks={[{ t: "quote", c: ["Invented words."], cite: ["p. 5"] }]} pdf={PDF} />,
        { card: { ...CARD, version: "publishedVersion", journal_offset: 100 } }
      )
    )
    await user.click(screen.getByRole("button", { name: "Copy the quote with its citation" }))
    expect(writeText).toHaveBeenLastCalledWith("“Invented words.” (Demo et al. 2026, p. 105)")
  })

  it("draws a table: column heads, cells with their page marks, a named region", () => {
    renderBlocks([
      {
        t: "table",
        head: ["Plot", "Array", "Area", "Source"],
        rows: [
          [["P1"], ["Array 1"], ["Invented area"], ["p. 6"]],
          [["P2"], ["Array 2"], [{ t: "muted", text: "not reported" }], ["p. 7"]],
        ],
      },
    ])
    const region = screen.getByRole("region", { name: "Invented results, table" })
    const table = within(region).getByRole("table")
    const heads = within(table).getAllByRole("columnheader")
    expect(heads.map((h) => h.textContent)).toEqual(["Plot", "Array", "Area", "Source"])
    expect(heads[1]).toHaveAttribute("scope", "col")
    const rows = within(table).getAllByRole("row")
    expect(rows).toHaveLength(3)
    expect(within(rows[1]!).getByRole("link", { name: /p\.\s6/ })).toHaveAttribute(
      "href",
      `${PDF}#page=6`
    )
    expect(table).toHaveClass("tabular-nums", "hyphens-none")
  })

  it("numbers the tables of a section when there are several", () => {
    const table: Block = { t: "table", head: ["A"], rows: [[["x"]]] }
    renderBlocks([table, table])
    expect(screen.getByRole("region", { name: "Invented results, table 1" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Invented results, table 2" })).toBeInTheDocument()
  })

  it("draws a lazy figure at its own size; with a lightbox to open, a click opens it", async () => {
    const user = userEvent.setup()
    const openFigure = vi.fn()
    const block: FigureBlock = {
      t: "figure",
      src: "library/demo/articles/k/figures/main.png",
      alt: "An invented diagram",
      caption: ["The diagram (Fig. 2, p. 3)."],
    }
    render(withArticle(<Blocks blocks={[block]} pdf={PDF} />, { openFigure }))
    const img = screen.getByRole("img", { name: "An invented diagram" })
    expect(img).toHaveAttribute("loading", "lazy")
    expect(img).toHaveAttribute("src", "/library/demo/articles/k/figures/main.png")
    // never enlarged: the image keeps its own size, at most the column's
    expect(img).toHaveClass("max-w-full", "h-auto")
    expect(screen.getByText(/The diagram/).closest("figcaption")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "An invented diagram: enlarge" }))
    expect(openFigure).toHaveBeenCalledWith("/library/demo/articles/k/figures/main.png")
  })

  it("says so when a figure's image is not safe to load", () => {
    renderBlocks([{ t: "figure", src: "javascript:alert(1)", alt: "Bad", caption: [] }])
    expect(screen.getByRole("img", { name: "Bad (image not available)" })).toBeInTheDocument()
    expect(document.querySelector("img")).toBeNull()
  })

  it("never loads a figure from another site by itself: it becomes a link", () => {
    renderBlocks([
      { t: "figure", src: "https://example.org/fig.png", alt: "An invented plot", caption: [] },
    ])
    expect(document.querySelector("img")).toBeNull()
    const link = screen.getByRole("link", { name: /Open the image/ })
    expect(link).toHaveAttribute("href", "https://example.org/fig.png")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getByText(/An invented plot: the image is on another site/)).toBeInTheDocument()
  })
})

describe("the key metrics table", () => {
  const metrics: Block = {
    t: "table",
    head: ["★", "Metric", "Value", "Condition", "Source"],
    rows: [
      [[], ["Invented speed"], ["40 per minute"], ["open"], ["Table 2"]],
      [
        ["★"],
        ["Invented accuracy"],
        [{ t: "b", text: "91.5% (95% CI 88.0, 94.5)" }],
        ["online"],
        ["p. 6"],
      ],
      [["★"], ["Invented rate"], ["median 12.5% across days"], ["offline"], ["p. 7"]],
    ],
  }

  it("puts headline rows first in bold, bolds only the figures, gives the interval its column", () => {
    renderBlocks([metrics])
    const table = screen.getByRole("table")
    const heads = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent)
    // no ★ column: a headline row's metric is bold
    expect(heads).toEqual(["Metric", "Value", "95% CI", "Condition", "Source", "Copy"])
    const rows = within(table).getAllByRole("row").slice(1)
    const metricsOf = rows.map((r) => within(r).getAllByRole("cell")[0]!)
    expect(metricsOf.map((c) => c.textContent)).toEqual([
      "Headline: Invented accuracy",
      "Headline: Invented rate",
      "Invented speed",
    ])
    expect(metricsOf[0]).toHaveClass("font-semibold")
    expect(metricsOf[2]).not.toHaveClass("font-semibold")
    const [first, second, third] = rows
    const value = within(first!).getAllByRole("cell")[1]!
    expect(value).toHaveTextContent(/^91\.5%$/)
    expect(value.querySelector("strong")).toHaveTextContent("91.5%")
    expect(value).toHaveClass("text-right", "num")
    expect(within(first!).getAllByRole("cell")[2]).toHaveTextContent(
      /confidence interval 88\.0–\u2060?94\.5$/
    )
    // a value that starts with words is not right-aligned
    const rate = within(second!).getAllByRole("cell")[1]!
    expect(rate.querySelector("strong")).toHaveTextContent("12.5%")
    expect(rate).toHaveTextContent("median 12.5% across days")
    expect(rate).toHaveClass("text-left")
    expect(within(third!).getAllByRole("cell")[1]).toHaveClass("text-right")
  })

  it("copies a row with its citation", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    renderBlocks([metrics])
    const [first] = screen.getAllByRole("button", { name: "Copy the metric with its citation" })
    await user.click(first!)
    expect(writeText).toHaveBeenLastCalledWith(
      "Invented accuracy: 91.5% (95% CI 88.0, 94.5), online (Demo et al. 2026, PDF p. 6)"
    )
  })
})

describe("GlossedSection", () => {
  it("puts the notes in an aside after the text they gloss, and folds provenance", () => {
    const section: Section = {
      id: "siting",
      title: "Invented siting",
      blocks: [
        { t: "p", c: ["Some text (p. 4)."] },
        { t: "quote", c: ["Quoted words."], cite: ["p. 4"] },
      ],
    }
    const { container, rerender } = render(
      withArticle(<GlossedSection section={section} number={3} pdf={PDF} />)
    )
    const region = screen.getByRole("region", { name: /Invented siting/ })
    expect(region).toHaveAttribute("id", "siting")
    expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent(
      /^3\s*Invented siting$/
    )
    const aside = container.querySelector("aside")
    expect(aside).toContainElement(screen.getByRole("figure"))
    // the text's mark and the note's share their page
    expect(container.querySelectorAll('[data-page="4"]')).toHaveLength(2)

    rerender(
      withArticle(
        <GlossedSection
          section={{
            id: "provenance",
            title: "Sources and provenance",
            blocks: [{ t: "fields", items: [{ label: "Paper", c: ["Invented"] }] }],
          }}
          number={9}
          pdf={PDF}
        />
      )
    )
    const details = container.querySelector("details")
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute("open")
    expect(details?.querySelector("summary")).toHaveTextContent("Paper")
  })
})

describe("FigureLightbox", () => {
  const section: Section = {
    id: "model",
    title: "Invented model",
    blocks: [
      {
        t: "figure",
        src: "library/demo/articles/k/figures/one.png",
        alt: "An invented diagram",
        caption: ["Fig. 2: the diagram (p. 3)."],
      },
      {
        t: "figure",
        src: "library/demo/articles/k/figures/two.png",
        alt: "Another invented diagram",
        caption: ["Fig. 3: the other one."],
      },
    ],
  }

  it("shows a figure with its caption and page, zooms, and goes through the figures", async () => {
    const user = userEvent.setup()
    const onIndexChange = vi.fn()
    // A figure much larger than the window shows it: it zooms.
    rememberSize("/library/demo/articles/k/figures/one.png", {
      naturalWidth: 3000,
      naturalHeight: 2000,
    } as HTMLImageElement)
    render(
      withArticle(
        <FigureLightbox
          figures={figuresOf([section])}
          index={0}
          onIndexChange={onIndexChange}
          pdf={PDF}
        />
      )
    )
    const dialog = await screen.findByRole("dialog", { name: "An invented diagram" })
    expect(within(dialog).getByRole("link", { name: /p\.\s3/ })).toHaveAttribute(
      "href",
      `${PDF}#page=3`
    )
    expect(within(dialog).getByText("1 of 2")).toBeInTheDocument()
    const zoom = within(dialog).getByRole("button", { name: "Zoom" })
    await user.click(zoom)
    expect(within(dialog).getByRole("button", { name: "Fit" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await user.click(within(dialog).getByRole("button", { name: "Next figure" }))
    expect(onIndexChange).toHaveBeenLastCalledWith(1)
    expect(within(dialog).getByRole("link", { name: /Open image/ })).toHaveAttribute(
      "target",
      "_blank"
    )
  })

  it("does not zoom a figure shown at its own size, and sizes its panel to it", async () => {
    rememberSize("/library/demo/articles/k/figures/two.png", {
      naturalWidth: 480,
      naturalHeight: 320,
    } as HTMLImageElement)
    render(
      withArticle(
        <FigureLightbox
          figures={figuresOf([section])}
          index={1}
          onIndexChange={() => {}}
          pdf={PDF}
        />
      )
    )
    const dialog = await screen.findByRole("dialog", { name: "Another invented diagram" })
    expect(within(dialog).queryByRole("button", { name: "Zoom" })).toBeNull()
    const img = within(dialog).getByRole("img")
    expect(img.style.width).toBe("480px")
  })
})

describe("columnWidth", () => {
  it("keeps short columns on one line and gives long ones room", () => {
    expect(columnWidth([2, 4, 5])).toBe("nowrap")
    expect(columnWidth([10, 20, 18])).toBe("narrow")
    expect(columnWidth([30, 40, 35])).toBe("medium")
    expect(columnWidth([70, 90, 120])).toBe("wide")
    expect(columnWidth([])).toBe("narrow")
  })
})
