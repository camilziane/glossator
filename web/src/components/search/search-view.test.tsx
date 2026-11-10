import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetStatusLine, StatusLine } from "@/components/shell/status-line"
import { requestReturn, resetPageEntries } from "@/hooks/page-entry"
import { writeListMemory } from "@/hooks/use-list-memory"
import { WIDE_QUERY } from "@/hooks/use-media-query"
import type { SearchHit } from "@/lib/api"
import { referenceParts } from "@/lib/cite"
import { indexLibrary, readArticleView } from "@/lib/data"
import { listKey, routes } from "@/lib/routes"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { router, setNavigation } from "../../../tests/utils/navigation"
import { renderWithApp } from "../../../tests/utils/render"

import { exampleQueries } from "./examples"
import { clearRecentSearches, rememberSearch } from "./recent-searches"
import { SearchView } from "./search-view"
import { clearPassageTexts } from "./use-passage-search"

const lib = indexLibrary(fixtureLibrary())
const novak = lib.article("ml", "novak2024")!.article
const ashworth = lib.article("ml", "ashworth2026")!.article
const method = readArticleView(ashworth).view!.sections.find((s) => s.id === "details")!

// Invented passages over the synthetic fixture's articles. The summary's passage is flattened
// `field: value` lines, as the server sends them: none of its field names may show.
const HITS: SearchHit[] = [
  {
    ref: "ml/novak2024/paper.pdf#4.1",
    cite: novak.cite,
    snippet: "…the toy filter raises accuracy on every invented session…",
    bib: "ml",
    key: "novak2024",
    source: "paper.pdf",
    page: 4,
    passage: 1,
  },
  {
    ref: "ml/ashworth2026/record:details",
    cite: ashworth.cite,
    snippet:
      "…sparse layers of an invented filter architecture: attention over the toy set source: p. 3…",
    bib: "ml",
    key: "ashworth2026",
    source: "record:details",
    page: null,
    passage: null,
  },
  {
    ref: "ml/novak2024/supplementary/table s1.pdf#2.3",
    cite: novak.cite,
    snippet: "Filter taps for each toy channel.",
    bib: "ml",
    key: "novak2024",
    source: "supplementary/table s1.pdf",
    page: 2,
    passage: 3,
  },
]

/** A paper's passage as /api/read gives it. */
const PASSAGE =
  "The toy filter passage, read whole. Here the toy filter raises accuracy on every invented session, as the table shows. After it."

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

interface MockOptions {
  mode?: "hybrid" | "keyword" | "semantic"
  hits?: SearchHit[]
  search?: (url: URL) => Response | Promise<Response>
  semantic?: boolean
}

function mockApi(opts: MockOptions = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://127.0.0.1")
    switch (url.pathname) {
      case "/api/status":
        return json({
          built: "2026-11-01T09:00:00+01:00",
          articles: 7,
          files: 9,
          text_passages: 120,
          semantic: opts.semantic ?? true,
        })
      case "/api/search":
        if (opts.search) return opts.search(url)
        return json({
          query: url.searchParams.get("q"),
          mode: opts.mode ?? url.searchParams.get("mode") ?? "hybrid",
          hits: opts.hits ?? HITS,
        })
      case "/api/read":
        return json({
          ref: url.searchParams.get("ref"),
          text:
            url.searchParams.get("page") === "1"
              ? `Text before the passage.\n\n${PASSAGE}\n\nText after it.`
              : url.searchParams.get("ref")?.includes("record:")
                ? "problem: Attention is slow.\nidea: Sparse layers of an invented filter.\narchitecture: attention over the toy set"
                : PASSAGE,
        })
      default:
        return json({ error: "no such API" }, 404)
    }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function calls(fetchMock: ReturnType<typeof mockApi>, path: string): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), "http://127.0.0.1"))
    .filter((u) => u.pathname === path)
}

/** A screen of 1280 px or more: the results and the reader side by side. */
function wideScreen() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === WIDE_QUERY,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  )
}

function mockClipboard() {
  const writeText = vi.fn(async (_text: string) => {})
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  return writeText
}

async function renderSearch(search = "") {
  setNavigation({ pathname: "/search/", search: search.replace(/^\?/, "") })
  return renderWithApp(
    <>
      <SearchView />
      <StatusLine />
    </>,
    { search }
  )
}

beforeEach(() => {
  clearPassageTexts()
  clearRecentSearches()
  resetStatusLine()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("<SearchView>", () => {
  it("before any search, offers three to try from the library's titles: no help box", async () => {
    mockApi()
    await renderSearch()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Search")
    expect(screen.getByRole("searchbox", { name: "Search the papers" })).toHaveValue("")
    expect(screen.queryByText(/Search inside the papers/)).toBeNull()
    expect(screen.queryByRole("heading", { name: "Recent searches" })).toBeNull()
    const examples = exampleQueries(lib)
    const sentence = screen.getByText(/^Try/)
    for (const q of examples) {
      expect(within(sentence).getByRole("link", { name: `“${q}”` })).toHaveAttribute(
        "href",
        routes.search({ q: `"${q}"` })
      )
    }
    // The filters as one sentence of text menus.
    const form = screen.getByRole("search", { name: "Full-text search" })
    expect(form).toHaveTextContent("Words and meaning in everything from every bibliography")
  })

  it("before a search, lists this tab's recent searches", async () => {
    mockApi()
    rememberSearch({ q: "toy filter", bib: "ml", scope: "records", mode: "hybrid" })
    await renderSearch()
    const recent = screen.getByRole("region", { name: "Recent searches" })
    const link = within(recent).getByRole("link", { name: /toy filter/ })
    expect(link).toHaveAttribute("href", "/search/?q=toy+filter&bib=ml&scope=records")
    expect(link).toHaveTextContent(`the summaries · ${lib.bib("ml")!.short}`)
  })

  it("groups passages by article, with their page marks, file and section", async () => {
    const fetchMock = mockApi()
    await renderSearch("?q=toy+filter")
    expect(await screen.findByText("3 passages in 2 articles")).toBeInTheDocument()
    const [search] = calls(fetchMock, "/api/search")
    expect(Object.fromEntries(search!.searchParams)).toEqual({
      q: "toy filter",
      scope: "all",
      mode: "hybrid",
      limit: "20",
    })

    const group = screen.getByRole("region", { name: novak.title })
    expect(within(group).getByRole("link", { name: novak.title })).toHaveAttribute(
      "href",
      `/article/?b=ml&k=novak2024&from=${encodeURIComponent("/search/?q=toy+filter")}`
    )
    expect(group).toHaveTextContent(referenceParts(novak).names[0]!)
    expect(within(group).getAllByRole("button", { name: /toy|Filter/ })).toHaveLength(2)
    expect(within(group).getByRole("link", { name: /^p\. 4/ })).toHaveAttribute(
      "href",
      "/library/ml/articles/novak2024/paper.pdf#page=4"
    )
    expect(within(group).getByRole("link", { name: /^p\. 2/ })).toHaveAttribute(
      "href",
      "/library/ml/articles/novak2024/supplementary/table%20s1.pdf#page=2"
    )
    // A supplementary file's name, in mono.
    expect(within(group).getByText("table s1.pdf")).toHaveClass("font-mono")
    // The words found together are one strong mark.
    const marks = [...group.querySelectorAll("mark")]
    expect(marks.find((m) => m.textContent === "toy filter")?.dataset.match).toBe("strong")
    // A passage cut mid-sentence says so with an ellipsis, never "...".
    expect(group).toHaveTextContent("…the toy filter raises accuracy on every invented session…")
    expect(group.textContent).not.toContain("...")
  })

  it("shows a summary's passage under its section's title, never a raw field name", async () => {
    mockApi()
    await renderSearch("?q=toy+filter")
    const group = await screen.findByRole("region", { name: ashworth.title })
    expect(within(group).getByText(method.title)).toBeVisible()
    expect(within(group).getByText("Architecture or algorithm")).toBeVisible()
    expect(group.textContent).not.toMatch(/\b(?:architecture|source):/)
    // Its page, from the passage's source.
    expect(within(group).getByRole("link", { name: /^p\. 3/ })).toHaveAttribute(
      "href",
      "/library/ml/articles/ashworth2026/paper.pdf#page=3"
    )
  })

  it("on a wide screen, previews the first passage and focuses it; ↑ ↓ move and preview", async () => {
    wideScreen()
    mockApi()
    await renderSearch("?q=toy+filter")
    const reader = await screen.findByRole("complementary", { name: "Passage" })
    await waitFor(() => expect(reader).toHaveTextContent("The toy filter passage, read whole."))
    expect(within(reader).getByRole("link", { name: novak.title })).toBeVisible()
    const rows = screen.getAllByRole("button", { current: true })
    expect(rows).toHaveLength(1)
    await waitFor(() => expect(rows[0]).toHaveFocus())

    const user = userEvent.setup()
    await user.keyboard("{ArrowDown}")
    const second = document.activeElement as HTMLElement
    expect(second.dataset.ref).toBe("ml/novak2024/supplementary/table s1.pdf#2.3")
    expect(second).toHaveAttribute("aria-current", "true")
    expect(await within(reader).findByText("table s1.pdf")).toBeVisible()
    // The summary's lines with their labels.
    await user.keyboard("{ArrowDown}")
    expect(await within(reader).findByText("Architecture or algorithm")).toBeVisible()
    expect(reader.textContent).not.toMatch(/\b(?:problem|idea|architecture):/)
  })

  it("opens the article at the passage's section with Enter, carrying the list", async () => {
    wideScreen()
    mockApi()
    await renderSearch("?q=toy+filter")
    const row = await screen.findByRole("button", { name: /invented filter/ })
    row.focus()
    fireEvent.keyDown(row, { key: "Enter" })
    expect(router.push).toHaveBeenCalledWith(
      `/article/?b=ml&k=ashworth2026&from=${encodeURIComponent("/search/?q=toy+filter")}#details`
    )
  })

  it("coming back from an article (Esc after paging with [ ]), starts on that article's passage", async () => {
    wideScreen()
    mockApi()
    // The article the reader paged to, written by the article's Esc; the URL still names the
    // passage first opened.
    const list = "/search/?q=toy+filter"
    window.history.replaceState(null, "", `${list}&read=${encodeURIComponent(HITS[0]!.ref)}`)
    requestReturn(`${list}&read=${encodeURIComponent(HITS[0]!.ref)}`)
    writeListMemory(listKey(list), { row: "ml/ashworth2026" })
    try {
      await renderSearch(`?q=toy+filter&read=${encodeURIComponent(HITS[0]!.ref)}`)
      const row = await screen.findByRole("button", { name: /invented filter/ })
      await waitFor(() => expect(row).toHaveAttribute("aria-current", "true"))
      await waitFor(() => expect(row).toHaveFocus())
    } finally {
      resetPageEntries()
      window.history.replaceState(null, "", "/")
    }
  })

  it("copies the citation by the page rule (c) and the passage's whole sentences (y)", async () => {
    wideScreen()
    mockApi()
    const writeText = mockClipboard()
    await renderSearch("?q=toy+filter")
    const row = (await screen.findAllByRole("button", { current: true }))[0]!
    await waitFor(() => expect(row).toHaveFocus())
    // The fixture's paper is an accepted manuscript: its page is the manuscript's.
    fireEvent.keyDown(row, { key: "c" })
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("\\cite{novak2024} % manuscript p. 4")
    )
    expect(await screen.findByText("\\cite{novak2024} % manuscript p. 4")).toBeInTheDocument()
    fireEvent.keyDown(row, { key: "y" })
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(
        `“Here the toy filter raises accuracy on every invented session, as the table shows.” (${referenceParts(novak).lead}, manuscript p. 4)`
      )
    )
    expect(await screen.findByText("Copied the passage with its citation")).toBeInTheDocument()
  })

  it("reads what a supplementary file is from its first page: a referee report is said so", async () => {
    wideScreen()
    const fetchMock = mockApi()
    const real = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://127.0.0.1")
      if (url.pathname === "/api/read" && url.searchParams.get("ref")?.endsWith("table s1.pdf#1"))
        return json({
          ref: url.searchParams.get("ref"),
          text: "Peer Review File. Reviewer #1 (Remarks to the Author): toy.",
        })
      return real(input)
    })
    const writeText = mockClipboard()
    await renderSearch("?q=toy+filter")
    const group = await screen.findByRole("region", { name: novak.title })
    expect(await within(group).findByText("Referee report")).toBeVisible()
    const row = within(group).getByRole("button", { name: /Filter taps/ })
    fireEvent.keyDown(row, { key: "y" })
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(
        expect.stringMatching(
          new RegExp(
            `^Referee comment on ${referenceParts(novak).lead} \\(Peer review file, p\\. 2\\): “`
          )
        )
      )
    )
  })

  it("on a narrow screen, reads a passage in a sheet, then its whole page", async () => {
    const user = userEvent.setup()
    const fetchMock = mockApi()
    await renderSearch("?q=toy+filter")
    const [first] = await screen.findAllByRole("button", { name: /raises accuracy/ })
    await user.click(first!)
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByText(/read whole/)).toBeVisible()
    expect(within(dialog).getByRole("link", { name: /PDF p\. 4/ })).toHaveAttribute(
      "target",
      "_blank"
    )
    await user.click(within(dialog).getByRole("button", { name: "All of page 4" }))
    expect(await within(dialog).findByText("Text before the passage.")).toBeVisible()
    expect(within(dialog).getByText("This passage")).toBeVisible()
    // (The supplementary file's first page is read too, to know what the file is.)
    const reads = calls(fetchMock, "/api/read").filter((u) =>
      u.searchParams.get("ref")?.startsWith("ml/novak2024/paper.pdf")
    )
    expect(reads.map((u) => u.searchParams.get("page"))).toEqual([null, "1"])
    expect(reads[1]?.searchParams.get("ref")).toBe("ml/novak2024/paper.pdf#4.1")
  })

  it("says honestly when the answer went by words only, while the meaning model loads", async () => {
    mockApi({ mode: "keyword", semantic: false })
    await renderSearch("?q=toy")
    expect(
      await screen.findByText(/By words only: the meaning model is still loading/)
    ).toBeVisible()
  })

  it("while typing, keeps the previous results dimmed and never shows the help", async () => {
    const user = userEvent.setup()
    mockApi()
    await renderSearch("?q=toy+filter")
    await screen.findByText("3 passages in 2 articles")
    const field = screen.getByRole("searchbox", { name: "Search the papers" })
    await user.click(field)
    await user.type(field, " x")
    const results = document.querySelector("[data-results]")!
    expect(results).toHaveAttribute("aria-busy", "true")
    expect(within(results as HTMLElement).getAllByRole("region").length).toBeGreaterThan(0)
    expect(screen.queryByRole("heading", { name: "Recent searches" })).toBeNull()
    expect(document.querySelector("[data-busy]")).not.toBeNull()
    await waitFor(() => expect(results).not.toHaveAttribute("aria-busy"))
  })

  it("lists the articles found by title that no passage stands for, on one line", async () => {
    const user = userEvent.setup()
    mockApi({ hits: HITS.slice(0, 1) })
    await renderSearch("?q=invented")
    const line = await screen.findByText(/Also by title:/)
    const paragraph = line.closest("p")!
    const links = within(paragraph).getAllByRole("link")
    expect(links.length).toBeGreaterThan(0)
    expect(links.map((l) => l.getAttribute("href"))).not.toContain(
      expect.stringContaining("k=novak2024")
    )
    const more = within(paragraph).queryByRole("button", { name: /more/ })
    if (more) {
      await user.click(more)
      expect(within(paragraph).getAllByRole("link").length).toBeGreaterThan(links.length)
    }
  })

  it("keeps working without the API: says what to run and searches the cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      })
    )
    const lindqvist = lib.article("grassland", "lindqvist2026")!.article
    await renderSearch("?q=moisture")
    expect(
      await screen.findByRole("heading", { name: "No answer from glossator serve" })
    ).toBeVisible()
    expect(screen.getByText("glossator serve", { selector: "code" })).toBeVisible()
    expect(
      screen.getByRole("link", { name: new RegExp(lindqvist.title.slice(0, 20)) })
    ).toHaveAttribute("href", expect.stringMatching(/^\/article\/\?b=grassland&k=lindqvist2026/))
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible()
  })

  it("shows the server's own words when the search fails", async () => {
    mockApi({ search: () => json({ error: "no index yet: run glossator build" }, 404) })
    await renderSearch("?q=toy")
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("The search could not answer")
    expect(alert).toHaveTextContent("no index yet: run glossator build")
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeVisible()
  })

  it("says when the server answered an error status, to look at its terminal", async () => {
    mockApi({ search: () => json({ error: "the meaning model failed" }, 500) })
    await renderSearch("?q=toy")
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("glossator serve answered 500 — see its terminal")
    expect(alert).toHaveTextContent("the meaning model failed")
  })

  it("says in a sentence where nothing was found, and how to look wider", async () => {
    const user = userEvent.setup()
    const fetchMock = mockApi({ hits: [] })
    await renderSearch("?q=zzqx&mode=keyword&scope=records")
    expect(await screen.findByText("No passage in the summaries says “zzqx”.")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "search everything" }))
    await waitFor(() => {
      const last = calls(fetchMock, "/api/search").at(-1)
      expect(last?.searchParams.get("scope")).toBe("all")
    })
  })

  it("waits for the typing to pause before asking the server", async () => {
    const user = userEvent.setup()
    const fetchMock = mockApi()
    await renderSearch()
    await user.type(screen.getByRole("searchbox", { name: "Search the papers" }), "filter")
    await screen.findByText("3 passages in 2 articles")
    const searches = calls(fetchMock, "/api/search")
    expect(searches.map((u) => u.searchParams.get("q"))).toEqual(["filter"])
  })

  it("lists its keys and signs in the shortcuts dialog", async () => {
    mockApi()
    await renderSearch()
    act(() => {
      fireEvent.keyDown(window, { key: "?" })
    })
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" })
    const section = within(dialog).getByRole("region", { name: "Search" })
    expect(section).toHaveTextContent("Open the article at the passage")
    expect(section).toHaveTextContent("Copy the LaTeX citation, with the page")
  })
})
