import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { rememberListOrder } from "@/hooks/use-list-memory"
import { referenceParts } from "@/lib/cite"
import { indexLibrary, plainText, readArticleView, type ArticleView as View } from "@/lib/data"
import { formatDate } from "@/lib/format"
import { routes } from "@/lib/routes"
import { typeset } from "@/lib/typeset"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { router, setNavigation } from "../../../tests/utils/navigation"
import { renderWithApp } from "../../../tests/utils/render"
import {
  articleFacts,
  colophonOf,
  FACTS_BESIDE_TITLE,
  keyMetricsSection,
  lowerFirst,
} from "./article-model"
import { suggestArticles } from "./article-not-found"
import { ArticleView } from "./article-view"

const lib = indexLibrary(fixtureLibrary())

async function open(bib: string, key: string, from?: string) {
  const search = `?b=${bib}&k=${key}${from ? `&from=${encodeURIComponent(from)}` : ""}`
  setNavigation({ pathname: "/article/", search })
  return renderWithApp(<ArticleView />, { search })
}

/** The fixture's article and its view. */
function fixture(bib: string, key: string) {
  const entry = lib.article(bib, key)!
  return { entry, view: readArticleView(entry.article).view as View }
}

afterEach(() => {
  window.sessionStorage.clear()
})

describe("ArticleView", () => {
  it("shows the header: kicker, cite, title, authors, venue, files and the Cite menu", async () => {
    const { entry, view } = fixture("grassland", "lindqvist2026")
    const { article, bib } = entry
    await open("grassland", "lindqvist2026")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(typeset(article.title))
    const header = screen.getByRole("heading", { level: 1 }).closest("header")!
    expect(header).toHaveTextContent(`${bib.short}·Article 1 of ${bib.articles.length}`)
    expect(header).toHaveTextContent(referenceParts(article).names[0]!)
    // "… Last · 12 authors"
    const count = /\((\d+) authors\)/.exec(article.authors)![1]
    expect(header).toHaveTextContent(`· ${count} authors`)
    // the venue line's date, as a reader writes it
    const iso = /\d{4}-\d{2}-\d{2}/.exec(JSON.stringify(view.meta))![0]
    expect(header).toHaveTextContent(formatDate(iso))

    const primary = view.files.find((f) => f.primary)!
    const pdf = within(header).getAllByRole("link", { name: /^PDF/ })[0]!
    expect(pdf).toHaveTextContent(primary.label)
    expect(pdf).toHaveAttribute("href", `/${primary.href}`)
    expect(pdf).toHaveAttribute("target", "_blank")
    expect(pdf).toHaveAttribute("aria-keyshortcuts", "p")
    const supplements = view.files.filter((f) => !f.primary && !f.href.endsWith("record.json"))
    expect(
      within(header).getByRole("button", { name: `Supplementary ${supplements.length}` })
    ).toBeInTheDocument()
    expect(within(header).getByRole("button", { name: /^Cite/ })).toHaveAttribute(
      "aria-keyshortcuts",
      "c"
    )
    // no record.json in the header: it is in the colophon
    expect(within(header).queryByRole("link", { name: /record\.json/ })).toBeNull()
  })

  it("lists the facts beside the title, leaving the key metrics to their table", async () => {
    const { view } = fixture("grassland", "lindqvist2026")
    await open("grassland", "lindqvist2026")
    const facts = screen.getByRole("region", { name: "Facts" })
    const terms = within(facts)
      .getAllByRole("term")
      .map((t) => t.textContent)
    expect(terms).toEqual(articleFacts(view.glance, view.lab, true).map((f) => f.label))
    expect(terms).not.toContain("Key metrics")
    // a label leads to the section that tells it all
    expect(within(facts).getByRole("link", { name: "Task" })).toHaveAttribute("href", "#task")
  })

  it("adds the lab to few facts", async () => {
    await open("grassland", "brandt2024grid")
    const facts = screen.getByRole("region", { name: "Facts" })
    expect(within(facts).getAllByRole("term").at(-1)).toHaveTextContent("Lab")
  })

  it("puts the key metrics first, then the figures, then the record's sections from 1", async () => {
    const { view } = fixture("grassland", "lindqvist2026")
    const metrics = keyMetricsSection(view.sections)!
    const others = view.sections.filter((s) => s !== metrics)
    await open("grassland", "lindqvist2026")
    const ids = [...document.querySelectorAll("section[data-section]")].map((s) => s.id)
    expect(ids).toEqual([metrics.id, "figures", ...others.map((s) => s.id)])
    // the page's own bands have no number; the record's sections are numbered from 1
    expect(screen.getByRole("heading", { level: 2, name: metrics.title })).toHaveTextContent(
      new RegExp(`^${metrics.title}$`)
    )
    expect(screen.getByRole("heading", { level: 2, name: "Figures" })).toHaveTextContent(
      /^Figures$/
    )
    expect(document.getElementById(`${others[0]!.id}--title`)).toHaveTextContent(
      new RegExp(`^1\\s+${others[0]!.title}$`)
    )
    // no "On this page", no pager cards
    expect(screen.queryByRole("navigation", { name: "On this page" })).toBeNull()
    expect(screen.queryByRole("navigation", { name: /More articles/ })).toBeNull()
  })

  it("glosses a section: its quote in an aside after the text, its page marks paired", async () => {
    const { view } = fixture("grassland", "lindqvist2026")
    const section = view.sections.find((s) => s.blocks.some((b) => b.t === "quote"))!
    await open("grassland", "lindqvist2026")
    const region = document.getElementById(section.id)!
    const aside = region.querySelector("aside")!
    const quote = within(aside).getAllByRole("figure")[0]!
    expect(quote.querySelector("blockquote")).not.toBeNull()
    expect(
      within(quote).getByRole("button", { name: "Copy the quote with its citation" })
    ).toBeInTheDocument()
    expect(quote.querySelector(".page-mark")).toHaveAttribute("data-page")
  })

  it("lights the marks of the same page in a section, both ways", async () => {
    const user = userEvent.setup()
    await open("grassland", "lindqvist2026")
    const region = document.getElementById("siting")!
    const marks = [...region.querySelectorAll<HTMLElement>(".page-mark")]
    const page = marks.find(
      (m) =>
        !m.closest("[data-gloss-note]") &&
        region.querySelector(`[data-gloss-note] [data-page="${m.dataset.page}"]`)
    )!
    await user.hover(page)
    // the notes of that page are lit (and the other marks of that page in the text)
    const lit = [...region.querySelectorAll("[data-lit]")]
    expect(lit.some((el) => el.matches("[data-gloss-note]"))).toBe(true)
    expect(lit).not.toContain(page)
    await user.unhover(page)
    expect(region.querySelectorAll("[data-lit]")).toHaveLength(0)
  })

  it("folds the sources and provenance, and ends with the colophon", async () => {
    const { entry, view } = fixture("grassland", "lindqvist2026")
    await open("grassland", "lindqvist2026")
    const provenance = document.getElementById("provenance")!
    expect(provenance.querySelector("details")).not.toHaveAttribute("open")
    const colophon = document.querySelector("footer")!
    const { verb, date } = colophonOf(view.footer)
    expect(colophon).toHaveTextContent(`${verb} ${formatDate(date)}`)
    expect(colophon).not.toHaveTextContent(/Generated by/)
    expect(within(colophon).getByRole("link", { name: /record\.json/ })).toHaveAttribute(
      "href",
      `/library/grassland/articles/${entry.article.key}/record.json`
    )
    expect(colophon).toHaveTextContent("glossator build")
  })

  it("puts a retraction first, in danger words no reader can miss", async () => {
    await open("grassland", "lindqvist2026")
    const banner = screen.getByRole("region", { name: "Notice: Retracted" })
    expect(banner).toHaveTextContent("This article was retracted on 30 Sep 2026.")
    expect(within(banner).getByRole("link", { name: /Retraction notice/ })).toHaveAttribute(
      "href",
      "https://doi.org/10.5555/jie.2026.0412.ret"
    )
    expect(within(banner).getByText("Retracted")).toHaveAttribute("data-slot", "badge")
  })

  it("notes a correction quietly", async () => {
    await open("grassland", "okafor2025")
    expect(screen.queryByRole("region", { name: /^Notice/ })).toBeNull()
    expect(
      screen.getByText(/A correction to this article was published on 15 Jan 2026/)
    ).toBeInTheDocument()
  })

  it("marks a draft and a PDF still to fetch", async () => {
    await open("grassland", "brandt2024grid")
    expect(screen.getAllByText("Draft")[0]).toBeInTheDocument()
    expect(screen.getAllByText("PDF · to fetch")[0]).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /PDF · to fetch/ })).toBeNull()
  })

  it("explains an unreadable record and how to fix it", async () => {
    await open("grassland", "mendes2023")
    expect(screen.getByRole("heading", { name: /record could not be read/ })).toBeInTheDocument()
    expect(screen.getByText("KeyError: 'siting'")).toBeInTheDocument()
    expect(screen.getByText("glossator check mendes2023 --bib grassland")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /record\.json/ })).toHaveAttribute(
      "href",
      "/library/grassland/articles/mendes2023/record.json"
    )
  })

  it("copies the citation key from the colophon", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    await open("ml", "novak2024")
    await user.click(screen.getByRole("button", { name: "Copy the citation key novak2024" }))
    expect(writeText).toHaveBeenCalledWith("novak2024")
  })

  it("writes the headline metrics as sentences, their sources beside, the table folded", async () => {
    const { view } = fixture("grassland", "lindqvist2026")
    const metrics = keyMetricsSection(view.sections)!
    const table = metrics.blocks.find((b) => b.t === "table")
    if (table?.t !== "table") throw new Error("no table")
    const starred = table.rows.filter((r) => plainText(r[0] ?? []).trim())
    await open("grassland", "lindqvist2026")
    const region = document.getElementById(metrics.id)!
    const sentences = region.querySelectorAll("p.reading")
    expect(sentences).toHaveLength(starred.length)
    expect(sentences[0]).toHaveTextContent(
      `${plainText(starred[0]![2]!)}: ${lowerFirst(plainText(starred[0]![1]!))}`
    )
    expect(sentences[0]!.querySelector("strong")).not.toBeNull()
    // each with its source and copy control in the margin
    const notes = region.querySelectorAll("aside [data-gloss-note]")
    expect(notes).toHaveLength(starred.length)
    expect(
      within(notes[0] as HTMLElement).getByRole("button", {
        name: "Copy the metric with its citation",
      })
    ).toBeInTheDocument()
    // the whole table under a disclosure
    const all = region.querySelector("details")!
    expect(all).not.toHaveAttribute("open")
    expect(all.querySelector("summary")).toHaveTextContent(`All ${table.rows.length} metrics`)
    expect(within(all).getByRole("table")).toBeInTheDocument()
  })

  it("continues the facts beside the first section without notes", async () => {
    const { view } = fixture("grassland", "lindqvist2026")
    const facts = articleFacts(view.glance, view.lab, true)
    await open("grassland", "lindqvist2026")
    const overview = document.getElementById("overview")!
    const continued = within(overview)
      .getAllByRole("term")
      .map((t) => t.textContent)
    expect(continued).toEqual(facts.slice(FACTS_BESIDE_TITLE).map((f) => f.label))
  })

  it("draws a link to another article of the library as its cite line", async () => {
    const { view } = fixture("grassland", "lindqvist2026")
    const related = view.sections.find((s) => s.id === "related")!
    const art = related.blocks
      .flatMap((b) => (b.t === "bullets" ? b.items.flat() : []))
      .find((p) => typeof p !== "string" && p.t === "art")
    if (!art || typeof art === "string" || art.t !== "art") throw new Error("no link")
    await open("grassland", "lindqvist2026")
    const link = within(document.getElementById("related")!).getAllByRole("link", {
      name: new RegExp(art.text),
    })[0]!
    expect(link.querySelector(".cite .au")).not.toBeNull()
  })

  it("shows a card of an article of the library it links to", async () => {
    const user = userEvent.setup()
    const { view } = fixture("grassland", "lindqvist2026")
    const art = view.sections
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.t === "p" ? b.c : []))
      .find((p) => typeof p !== "string" && p.t === "art")
    if (!art || typeof art === "string" || art.t !== "art") throw new Error("no link")
    const target = lib.article(art.bib, art.key)!.article
    await open("grassland", "lindqvist2026")
    await user.hover(screen.getAllByRole("link", { name: art.text })[0]!)
    expect(await screen.findByText(typeset(target.one_line))).toBeInTheDocument()
  })
})

describe("the article's keys", () => {
  const bib = lib.bib("grassland")!
  const [first, second] = bib.articles

  it("pages within the bibliography with [ and ], in place", async () => {
    await open("grassland", first!.key)
    await userEvent.keyboard("]")
    expect(router.replace).toHaveBeenCalledWith(routes.article("grassland", second!.key))
    router.replace.mockClear()
    await userEvent.keyboard("[[")
    expect(router.replace).not.toHaveBeenCalled()
    // the pager says where it leads
    expect(
      screen.getAllByRole("link", { name: `Next article: ${second!.cite}` })[0]
    ).toHaveAttribute("aria-keyshortcuts", "]")
  })

  it("pages within the list the reader came from, and Esc returns to it", async () => {
    const from = "/bib/?b=grassland&q=invented"
    const order = [`grassland/${second!.key}`, `grassland/${first!.key}`]
    rememberListOrder(from, order)
    await open("grassland", first!.key, from)
    expect(screen.getByRole("heading", { level: 1 }).closest("header")).toHaveTextContent(
      "Article 2 of 2 in the list you came from"
    )
    await userEvent.keyboard("[[")
    expect(router.replace).toHaveBeenCalledWith(
      routes.article("grassland", second!.key, undefined, { from })
    )
    await userEvent.keyboard("{Escape}")
    expect(router.push).toHaveBeenCalledWith(from)
  })

  it("stays with Esc when the article was not opened from a list", async () => {
    await open("grassland", first!.key)
    await userEvent.keyboard("{Escape}")
    expect(router.push).not.toHaveBeenCalled()
    expect(router.back).not.toHaveBeenCalled()
  })

  it("opens the Cite menu with c, and goes to the key metrics with m", async () => {
    await open("grassland", first!.key)
    await userEvent.keyboard("c")
    const menu = await screen.findByRole("menu")
    expect(
      within(menu).getByRole("menuitem", { name: "Copy the BibTeX entry" })
    ).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    const all = document.querySelector<HTMLDetailsElement>("#metrics details")!
    expect(all.open).toBe(false)
    const scroll = vi.spyOn(window, "scrollTo")
    await act(async () => {
      await userEvent.keyboard("m")
    })
    // the section comes, its whole table open
    expect(scroll).toHaveBeenCalled()
    expect(window.location.hash).toBe("#metrics")
    expect(all.open).toBe(true)
    window.history.replaceState(null, "", "/")
  })

  it("copies the quote in focus with y", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    await open("grassland", first!.key)
    const button = screen.getAllByRole("button", { name: "Copy the quote with its citation" })[0]!
    act(() => button.focus())
    await userEvent.keyboard("y")
    expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/^“.+” \(.+\)$/))
    await userEvent.keyboard("{Shift>}Y{/Shift}")
    expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/^\\cite/))
  })
})

describe("a link that names no article", () => {
  it("answers an unknown key with what it may have meant", async () => {
    await open("ml", "novak2042")
    expect(screen.getByRole("heading", { level: 1, name: "No such article" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Novak & Ito 2024/ })).toHaveAttribute(
      "href",
      "/article/?b=ml&k=novak2024"
    )
    expect(screen.getByRole("link", { name: /All articles of ML methods/ })).toHaveAttribute(
      "href",
      "/bib/?b=ml"
    )
  })

  it("says when the link names no article at all", async () => {
    setNavigation({ pathname: "/article/" })
    await renderWithApp(<ArticleView />)
    expect(screen.getByText(/This link names no article/)).toBeInTheDocument()
  })
})

describe("suggestArticles", () => {
  it("offers keys a typo away, then the quick search's answers", () => {
    expect(suggestArticles(lib, "ml", "novak2042")[0]?.article.key).toBe("novak2024")
    expect(suggestArticles(lib, "", "ferreira")[0]?.article.key).toBe("ferreira2025")
    expect(suggestArticles(lib, "ml", "")).toEqual([])
  })
})
