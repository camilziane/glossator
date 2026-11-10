import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type OnUrlUpdateFunction } from "nuqs/adapters/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { plainText, type Bibliography, type Library } from "@/lib/data"
import { noticeLabel } from "@/lib/labels"
import { routes } from "@/lib/routes"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { router, setNavigation } from "../../../tests/utils/navigation"
import { renderWithApp } from "../../../tests/utils/render"
import { BibView } from "./bib-view"
import { formatYearSpan, hubModel } from "./model"

async function renderHub(search: string, onUrlUpdate?: OnUrlUpdateFunction, library?: Library) {
  setNavigation({ pathname: "/bib/", search })
  return renderWithApp(<BibView />, { search: `?${search}`, onUrlUpdate, library })
}

/** The fixture's bibliographies: the one with three tables, the one with two, the empty one. */
function fixtureBibs() {
  const bibs = fixtureLibrary().bibliographies
  const grass = bibs.find((b) => b.tables.length === 3)!
  const ml = bibs.find((b) => b.tables.length === 2 && b.articles.length > 0)!
  const empty = bibs.find((b) => b.articles.length === 0)!
  return { grass, ml, empty }
}

function articlesTable() {
  return screen.getByRole("table", { name: /^Articles of/ })
}

function bodyRows() {
  return within(articlesTable()).getAllByRole("row").slice(1)
}

function rowIds() {
  return bodyRows().map((r) => r.getAttribute("data-row-id"))
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** The list's `from` for a hub URL (what its article links carry). */
function from(search: string) {
  return `/bib/?${search}`
}

/** The polite count under the toolbar. */
function count() {
  return screen.getAllByRole("status").find((s) => /article/.test(s.textContent ?? ""))!
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  window.history.replaceState(null, "", "/")
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

/** user-event installs a clipboard of its own: put ours in after it. */
function useOurClipboard() {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
}

describe("BibView", () => {
  it("shows the bibliography's header on one line, its numbers and its tables", async () => {
    const { grass } = fixtureBibs()
    const model = hubModel(grass)
    await renderHub(`b=${grass.name}`)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(grass.title)
    const numbers = screen.getByRole("list", { name: "In numbers" })
    expect(numbers).toHaveTextContent(`${grass.articles.length} articles`)
    expect(numbers).toHaveTextContent(formatYearSpan(model.stats.years!))
    expect(
      within(numbers).getByRole("button", { name: `1 ${model.stats.flaggedWord}` })
    ).toBeVisible()
    expect(within(numbers).getByRole("button", { name: "1 draft" })).toBeVisible()
    expect(screen.getByRole("link", { name: "Search the papers" })).toHaveAttribute(
      "href",
      routes.search({ bib: grass.name })
    )
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent)
    expect(tabs).toEqual([model.articles, ...model.others].map((t) => `${t.title}${t.rows.length}`))
    expect(count()).toHaveTextContent(`${grass.articles.length} articles`)
  })

  it("draws each row: the title (the row's link), the citation, its notices and marks", async () => {
    const { grass } = fixtureBibs()
    const rows = hubModel(grass).articles.rows
    await renderHub(`b=${grass.name}`)
    expect(bodyRows()).toHaveLength(rows.length)
    expect(rowIds()).toEqual(rows.map((r) => r.ref))
    const first = within(bodyRows()[0]!)
    // The title and its citation are the row's link.
    const link = first.getByRole("link", { name: new RegExp(`^${escape(rows[0]!.title)}`) })
    expect(link).toHaveTextContent(rows[0]!.article!.cite.split(",")[0]!)
    expect(link).toHaveAttribute(
      "href",
      routes.article(grass.name, rows[0]!.key!, undefined, { from: from(`b=${grass.name}`) })
    )
    // Out of the tab order: the row is the stop.
    expect(link).toHaveAttribute("tabindex", "-1")
    const flagged = rows.findIndex((r) => r.notice === "serious")
    expect(
      within(bodyRows()[flagged]!).getByText(noticeLabel(rows[flagged]!.notices[0]!))
    ).toBeVisible()
    const draft = rows.findIndex((r) => r.status === "draft")
    expect(within(bodyRows()[draft]!).getByText("Draft")).toBeVisible()
    const marked = rows.findIndex((r) => r.badges.some((b) => b !== "draft"))
    const mark = rows[marked]!.badges.find((b) => b !== "draft")!
    expect(within(bodyRows()[marked]!).getByText(mark)).toBeVisible()
    const year = within(articlesTable()).getByRole("columnheader", { name: /Year/ })
    expect(year).toHaveAttribute("aria-sort", "descending")
  })

  it("filters by every word of the box, from the URL", async () => {
    await renderHub("b=grassland&q=moisture%20probe")
    expect(bodyRows()).toHaveLength(1)
    expect(count()).toHaveTextContent("1 of 4 articles")
  })

  it("keeps the articles with all the chosen tags, or any of them", async () => {
    const { grass } = fixtureBibs()
    const rows = hubModel(grass).articles.rows
    const tags = [...new Set(rows.flatMap((r) => r.tags))]
    const [a, b] = tags
      .flatMap((x) => tags.map((y) => [x, y] as const))
      .find(([x, y]) => {
        const both = rows.filter((r) => r.tags.includes(x) && r.tags.includes(y)).length
        const either = rows.filter((r) => r.tags.includes(x) || r.tags.includes(y)).length
        return x !== y && both > 0 && either > both
      })!
    const search = `b=${grass.name}&tag=${encodeURIComponent(a)}&tag=${encodeURIComponent(b)}`
    await renderHub(search)
    expect(rowIds()).toEqual(
      rows.filter((r) => r.tags.includes(a) && r.tags.includes(b)).map((r) => r.ref)
    )
    // The filters said in words: the tags joined by "and", each removable.
    expect(screen.getByRole("button", { name: `Remove the tag ${a}` })).toBeVisible()
    expect(screen.getByText("and")).toBeVisible()
  })

  it("keeps the articles with any of the tags when the URL asks", async () => {
    const { grass } = fixtureBibs()
    const rows = hubModel(grass).articles.rows
    const [a, b] = [...new Set(rows.flatMap((r) => r.tags))]
    await renderHub(
      `b=${grass.name}&tag=${encodeURIComponent(a!)}&tag=${encodeURIComponent(b!)}&tagmode=any`
    )
    expect(rowIds()).toEqual(
      rows.filter((r) => r.tags.includes(a!) || r.tags.includes(b!)).map((r) => r.ref)
    )
    expect(screen.getByText("or")).toBeVisible()
  })

  it.each([
    ["notice=serious", (r: { notice: string }) => r.notice === "serious"],
    ["status=draft", (r: { status: string }) => r.status === "draft"],
    [
      "year=2024-2025",
      (r: { year: number | null }) => r.year !== null && r.year >= 2024 && r.year <= 2025,
    ],
    ["year=-2023", (r: { year: number | null }) => r.year !== null && r.year <= 2023],
  ] as const)("keeps the rows %s asks for", async (filter, keep) => {
    const { grass } = fixtureBibs()
    const rows = hubModel(grass).articles.rows
    await renderHub(`b=${grass.name}&${filter}`)
    expect(rowIds()).toEqual(rows.filter((r) => keep(r as never)).map((r) => r.ref))
  })

  it("filters from the header's figures", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>()
    const { grass } = fixtureBibs()
    const model = hubModel(grass)
    await renderHub(`b=${grass.name}`, onUrlUpdate)
    await userEvent.click(screen.getByRole("button", { name: `1 ${model.stats.flaggedWord}` }))
    expect(onUrlUpdate.mock.lastCall?.[0].searchParams.getAll("notice")).toEqual(["serious"])
    await userEvent.click(screen.getByRole("button", { name: "1 draft" }))
    expect(onUrlUpdate.mock.lastCall?.[0].searchParams.getAll("status")).toEqual(["draft"])
  })

  it("says when nothing matches and clears the filters", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>()
    await renderHub("b=grassland&q=nothing-like-this", onUrlUpdate)
    expect(screen.getByText("No article matches")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Clear the filters" }))
    expect(onUrlUpdate).toHaveBeenCalled()
    expect(onUrlUpdate.mock.lastCall?.[0].queryString).toBe("?b=grassland")
  })

  it("sorts from a column head and writes the sort in the URL", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>()
    const { grass } = fixtureBibs()
    const rows = hubModel(grass).articles.rows
    await renderHub(`b=${grass.name}`, onUrlUpdate)
    await userEvent.click(within(articlesTable()).getByRole("button", { name: "Year" }))
    expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get("sort")).toBe("year.asc")
    const oldest = [...rows].filter((r) => r.year !== null).sort((x, y) => x.year! - y.year!)[0]!
    expect(rowIds()[0]).toBe(oldest.ref)
  })

  it("reads the sort from the URL", async () => {
    const { ml } = fixtureBibs()
    await renderHub(`b=${ml.name}&sort=article.asc`)
    const rows = hubModel(ml).articles.rows
    const byCite = [...rows].sort((a, b) => a.cite.localeCompare(b.cite, "en"))
    expect(rowIds()).toEqual(byCite.map((r) => r.ref))
    expect(within(articlesTable()).getByRole("columnheader", { name: /Article/ })).toHaveAttribute(
      "aria-sort",
      "ascending"
    )
  })

  it("moves between rows with the arrows and opens one with Enter, from this list", async () => {
    const { grass } = fixtureBibs()
    const rows = hubModel(grass).articles.rows
    await renderHub(`b=${grass.name}`)
    expect(bodyRows()[0]).toHaveAttribute("tabindex", "0")
    expect(bodyRows()[1]).toHaveAttribute("tabindex", "-1")
    act(() => bodyRows()[0]!.focus())
    fireEvent.keyDown(bodyRows()[0]!, { key: "ArrowDown" })
    expect(document.activeElement).toBe(bodyRows()[1])
    expect(bodyRows()[1]).toHaveAttribute("tabindex", "0")
    fireEvent.keyDown(bodyRows()[1]!, { key: "Enter" })
    expect(router.push).toHaveBeenCalledWith(
      routes.article(grass.name, rows[1]!.key!, undefined, { from: from(`b=${grass.name}`) })
    )
  })

  it("walks a row's cells with ← → and comes back with Esc", async () => {
    await renderHub("b=grassland")
    const row = bodyRows()[0]!
    act(() => row.focus())
    fireEvent.keyDown(row, { key: "ArrowRight" })
    const cells = row.querySelectorAll("[data-cell]")
    expect(document.activeElement).toBe(cells[0])
    fireEvent.keyDown(cells[0]!, { key: "ArrowRight" })
    expect(document.activeElement).toBe(cells[1])
    fireEvent.keyDown(cells[1]!, { key: "ArrowDown" })
    expect(document.activeElement).toBe(bodyRows()[1]!.querySelectorAll("[data-cell]")[1])
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(document.activeElement).toBe(bodyRows()[1])
  })

  it("remembers the list's order for the article's pager", async () => {
    const { grass } = fixtureBibs()
    const rows = hubModel(grass).articles.rows
    await renderHub(`b=${grass.name}&sort=year.asc`)
    const key = Object.keys(window.sessionStorage).find((k) => k.startsWith("list-order:"))!
    expect(key).toContain(`b=${grass.name}`)
    const order = JSON.parse(window.sessionStorage.getItem(key)!) as string[]
    expect(order).toEqual(rowIds().filter((id) => rows.some((r) => r.ref === id && r.key)))
  })

  it("previews a row with Space: its one-liner, key metrics and actions", async () => {
    const { grass } = fixtureBibs()
    const rows = hubModel(grass).articles.rows
    await renderHub(`b=${grass.name}`)
    const row = bodyRows()[0]!
    act(() => row.focus())
    fireEvent.keyDown(row, { key: " " })
    const drawer = await screen.findByRole("region", { name: rows[0]!.title })
    const lead = plainText(
      (rows[0]!.article!.view as { lead: Parameters<typeof plainText>[0] }).lead
    )
    expect(drawer).toHaveTextContent(lead.slice(0, 40))
    expect(within(drawer).getByRole("heading", { name: "Key metrics" })).toBeVisible()
    expect(within(drawer).getByRole("link", { name: /^Open/ })).toHaveAttribute(
      "href",
      routes.article(grass.name, rows[0]!.key!, undefined, { from: from(`b=${grass.name}`) })
    )
    expect(within(drawer).getByRole("link", { name: /^PDF/ })).toBeVisible()
    expect(within(drawer).getByRole("button", { name: /^Cite/ })).toBeVisible()
    // The row keeps the focus; ↓ moves the preview along.
    expect(document.activeElement).toBe(row)
    fireEvent.keyDown(row, { key: "ArrowDown" })
    expect(await screen.findByRole("region", { name: rows[1]!.title })).toBeVisible()
    // Esc closes it and the row stays focused.
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("region", { name: rows[1]!.title })).toBeNull())
    expect(document.activeElement).toBe(bodyRows()[1])
  })

  it("previews a row on a click outside its title, opens it on a double click", async () => {
    const { ml } = fixtureBibs()
    const rows = hubModel(ml).articles.rows
    await renderHub(`b=${ml.name}`)
    const cell = within(bodyRows()[1]!).getAllByRole("cell")[2]!
    await userEvent.click(cell)
    expect(await screen.findByRole("region", { name: rows[1]!.title })).toBeVisible()
    expect(router.push).not.toHaveBeenCalled()
    await userEvent.dblClick(cell)
    expect(router.push).toHaveBeenCalledWith(
      routes.article(ml.name, rows[1]!.key!, undefined, { from: from(`b=${ml.name}`) })
    )
  })

  it("opens the row's PDF with p, and its Cite menu with c", async () => {
    const open = vi.fn()
    vi.stubGlobal("open", open)
    const { grass } = fixtureBibs()
    await renderHub(`b=${grass.name}`)
    const row = bodyRows()[0]!
    act(() => row.focus())
    fireEvent.keyDown(row, { key: "p" })
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/), "_blank", "noopener")
    fireEvent.keyDown(row, { key: "c" })
    expect(await screen.findByRole("menuitem", { name: "Copy the citation key" })).toBeVisible()
  })

  it("copies the visible rows and columns as Markdown, CSV or LaTeX", async () => {
    const { grass } = fixtureBibs()
    const model = hubModel(grass)
    await renderHub(`b=${grass.name}&q=moisture`)
    useOurClipboard()
    await userEvent.click(screen.getByRole("button", { name: /^Copy/ }))
    useOurClipboard()
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "The table as Markdown table" })
    )
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const md = writeText.mock.lastCall![0] as string
    const lines = md.trimEnd().split("\n")
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain(`| ${model.articles.columns[0]!.title} | Year |`)

    await userEvent.click(screen.getByRole("button", { name: /^(Copy|Copied)/ }))
    useOurClipboard()
    await userEvent.click(await screen.findByRole("menuitem", { name: "The table as LaTeX table" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    const key = bodyRows()[0]!.getAttribute("data-row-id")!.split("/")[1]
    expect(writeText.mock.lastCall![0]).toContain(`\\cite{${key}}`)
    expect(writeText.mock.lastCall![0]).toContain("\\begin{tabularx}")

    // The headline metrics of the same rows: one line each.
    await userEvent.click(screen.getByRole("button", { name: /^(Copy|Copied)/ }))
    useOurClipboard()
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "The headline metrics as CSV" })
    )
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3))
    const csv = (writeText.mock.lastCall![0] as string).trimEnd().split("\n")
    expect(csv[0]).toBe("Key,Citation,Metric,Value,CI,Condition,Page")
    expect(csv.slice(1).every((line) => line.startsWith(`${key},`))).toBe(true)
    expect(csv.length).toBeGreaterThan(1)
  })

  it("shows a short table whole, rows of one line or two on request, per bibliography", async () => {
    const { grass, ml } = fixtureBibs()
    // The fixture's tables are short (15 rows or fewer): everything shows until asked otherwise.
    expect(grass.articles.length).toBeLessThanOrEqual(15)
    await renderHub(`b=${grass.name}`)
    expect(articlesTable()).toHaveAttribute("data-lines", "full")
    await userEvent.click(screen.getByRole("radio", { name: "2 lines" }))
    expect(articlesTable()).toHaveAttribute("data-lines", "2")
    await userEvent.click(screen.getByRole("radio", { name: "1 line" }))
    expect(articlesTable()).toHaveAttribute("data-lines", "1")
    expect(window.localStorage.getItem(`glossator:hub-rows:${grass.name}`)).toBe("1")
    // Another bibliography keeps its own.
    expect(window.localStorage.getItem(`glossator:hub-rows:${ml.name}`)).toBeNull()
  })

  it("puts the citation beside the title on one-line rows, never cuts it otherwise", async () => {
    const { grass } = fixtureBibs()
    window.localStorage.setItem(`glossator:hub-rows:${grass.name}`, "1")
    await renderHub(`b=${grass.name}`)
    const cell = within(bodyRows()[0]!).getAllByRole("cell")[0]!
    const line = cell.querySelector("[data-row-title] > span")!
    expect(line).toHaveClass("flex")
    expect(line.querySelector("[data-clamp]")).not.toBeNull()
    window.localStorage.setItem(`glossator:hub-rows:${grass.name}`, "2")
    window.dispatchEvent(new Event("storage"))
    await waitFor(() => expect(articlesTable()).toHaveAttribute("data-lines", "2"))
    // Two lines: the title and the key metrics whole, the other cells clamped.
    const row = bodyRows()[0]!
    expect(row.querySelector("[data-row-title] [data-clamp]")).toBeNull()
    const metrics = hubModel(grass).metricsColumn!
    expect(row.querySelector(`td[data-col-id="${metrics}"] [data-clamp]`)).toBeNull()
    expect(row.querySelectorAll("[data-clamp]").length).toBeGreaterThan(0)
  })

  it("does not sort by key metrics (they mix kinds of figures)", async () => {
    const { grass } = fixtureBibs()
    const model = hubModel(grass)
    await renderHub(`b=${grass.name}`)
    const title = model.articles.columns.find((c) => c.id === model.metricsColumn)!.title
    const head = within(articlesTable()).getByRole("columnheader", { name: new RegExp(title) })
    expect(within(head).queryByRole("button")).toBeNull()
  })

  it("chooses tags in the Tags menu, grouped, and how they combine", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>()
    const { grass } = fixtureBibs()
    const model = hubModel(grass)
    await renderHub(`b=${grass.name}`, onUrlUpdate)
    await userEvent.click(screen.getByRole("button", { name: /^Tags/ }))
    const list = await screen.findByRole("listbox", { name: "Tags" })
    // The field to find a tag has the focus: typing narrows, Enter toggles the first match.
    await waitFor(() => expect(screen.getByPlaceholderText("Find a tag")).toHaveFocus())
    for (const group of model.tagGroups) {
      if (group.label) expect(within(list).getByText(group.label)).toBeVisible()
    }
    const tag = model.tagGroups[0]!.tags[0]!
    await userEvent.click(within(list).getByRole("option", { name: new RegExp(tag.label) }))
    expect(onUrlUpdate.mock.lastCall?.[0].searchParams.getAll("tag")).toEqual([tag.value])
    await userEvent.click(screen.getByRole("radio", { name: "any" }))
    expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get("tagmode")).toBe("any")
    const other = model.tagGroups.flatMap((g) => g.tags).find((t) => t.value !== tag.value)!
    const find = screen.getByPlaceholderText("Find a tag")
    await userEvent.type(find, other.label)
    await userEvent.keyboard("{Enter}")
    expect(onUrlUpdate.mock.lastCall?.[0].searchParams.getAll("tag")).toContain(other.value)
  })

  it("shows the table the hash names", async () => {
    window.history.replaceState(null, "", "/bib/?b=grassland#plots")
    await renderHub("b=grassland")
    const table = screen.getByRole("table", { name: /^Plots of/ })
    expect(within(table).getAllByRole("row")).toHaveLength(3)
    expect(within(table).getByText("P1")).toBeInTheDocument()
  })

  it("breaks a plot's id only after its hyphens", async () => {
    const library = fixtureLibrary()
    const grass = library.bibliographies.find((b) => b.tables.length === 3)!
    const table = grass.tables.find((t) => t.id === "plots")!
    const id = `${grass.name}-${plainText(table.rows[0]![0]!)}`
    table.rows[0]![0] = [{ t: "b", text: id }]
    window.history.replaceState(null, "", `/bib/?b=${grass.name}#plots`)
    await renderHub(`b=${grass.name}`, undefined, library)
    const cell = within(screen.getByRole("table", { name: /^Plots of/ }))
      .getAllByRole("row")[1]!
      .querySelector("td")!
    expect(cell).toHaveTextContent(id)
    expect(cell.querySelectorAll("wbr")).toHaveLength(id.split("-").length - 1)
  })

  it("links an entry of a second table that is a tag to the Articles it tags", async () => {
    const { grass } = fixtureBibs()
    const tags = new Set(grass.articles.flatMap((a) => a.tags))
    const table = grass.tables.find(
      (t) => t.id !== "articles" && t.rows.some((r) => tags.has(plainText(r[0]!)))
    )!
    const entry = table.rows.map((r) => plainText(r[0]!)).find((t) => tags.has(t))!
    window.history.replaceState(null, "", `/bib/?b=${grass.name}#${table.id}`)
    await renderHub(`b=${grass.name}`)
    const link = within(
      screen.getByRole("table", { name: new RegExp(`^${table.title} of`) })
    ).getByRole("link", { name: new RegExp(`^${entry}`) })
    const href = new URL(link.getAttribute("href")!, "http://x")
    expect(href.pathname).toBe("/bib/")
    expect(href.searchParams.get("b")).toBe(grass.name)
    expect(href.searchParams.getAll("tag")).toEqual([entry])
  })

  it("switches tables through the hash", async () => {
    await renderHub("b=ml")
    await userEvent.click(screen.getByRole("tab", { name: /Kinds/ }))
    expect(window.location.hash).toBe("#kinds")
    expect(screen.getByRole("table", { name: /^Kinds of/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("tab", { name: /Articles/ }))
    expect(window.location.hash).toBe("")
  })

  it("shows the scope's first sentence, the rest behind more", async () => {
    const library = fixtureLibrary()
    const [first, second] = library.bibliographies
    first!.scope = `${first!.scope} ${second!.scope}`
    await renderHub(`b=${first!.name}`, undefined, library)
    const more = screen.getByRole("button", { name: "more" })
    expect(more).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(more)
    expect(screen.getByRole("button", { name: "less" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("banner")).toHaveTextContent(second!.scope.slice(0, 30))
  })

  it("says what to do with an empty bibliography", async () => {
    await renderHub(`b=${fixtureBibs().empty.name}`)
    expect(screen.getByText("No article yet")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("names a bibliography the library does not have", async () => {
    await renderHub("b=nowhere")
    expect(screen.getByText("No such bibliography")).toBeInTheDocument()
  })

  it("keeps a bibliography's rows when the data has no notices field", async () => {
    const library = fixtureLibrary()
    const grass: Bibliography = library.bibliographies[0]!
    for (const a of grass.articles) a.notices = []
    await renderHub(`b=${grass.name}`, undefined, library)
    expect(bodyRows()).toHaveLength(grass.articles.length)
    expect(screen.queryByText("Retracted")).not.toBeInTheDocument()
  })
})
