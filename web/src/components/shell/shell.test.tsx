import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LibraryError, primeLibrary, useLibrary } from "@/lib/data"
import { APP_NAME, CLI_NAME } from "@/lib/site"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { router, setNavigation } from "../../../tests/utils/navigation"
import { renderWithApp } from "../../../tests/utils/render"

import { CommandPaletteProvider, useCommandPalette } from "./command-palette-context"
import { explainError } from "./data-error"
import { GlobalKeys } from "./global-keys"
import { bibLabel, bibsFitInline, navPlace } from "./nav-model"
import { NotInLibrary } from "./not-in-library"
import { PageHeader } from "./page"
import { PageSkeleton } from "./page-skeleton"
import { TopBar } from "./top-bar"

function Titles() {
  const lib = useLibrary()
  return (
    <ul>
      {lib.bibliographies.map((b) => (
        <li key={b.name}>{b.title}</li>
      ))}
    </ul>
  )
}

describe("LibraryBoundary", () => {
  afterEach(() => {
    primeLibrary(null)
    vi.unstubAllGlobals()
  })

  it("renders the children with the library", async () => {
    await renderWithApp(<Titles />)
    expect(screen.getByText("Grassland soil and canopy sensors, invented")).toBeInTheDocument()
  })

  it("explains a missing library inline and offers to try again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "no data yet: run glossator build" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          })
      )
    )
    primeLibrary(null)
    await renderWithApp(<Titles />, { library: null })
    const alert = screen.getByRole("alert")
    expect(within(alert).getByRole("heading", { level: 1 })).toHaveTextContent(
      "No library data yet"
    )
    expect(alert).toHaveTextContent(`${CLI_NAME} build`)
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument()
  })
})

describe("the error messages", () => {
  it("tell a request that failed from an error the server answered", () => {
    const failed = new LibraryError("unreachable", "Nothing answers at /data/library.json.")
    expect(explainError(failed)).toMatchObject({
      title: `No answer from ${CLI_NAME} serve`,
      command: `${CLI_NAME} serve`,
    })
    const answered = new LibraryError(
      "unreachable",
      "The server could not reach the data (500).",
      "OSError: invented failure"
    )
    expect(explainError(answered).title).toBe(`${CLI_NAME} serve answered 500 — see its terminal`)
    // The dev server's proxy answers a bare 500 when nothing listens behind it.
    const proxied = new LibraryError("unreachable", "The server could not reach the data (500).")
    expect(explainError(proxied).title).toBe(`No answer from ${CLI_NAME} serve`)
    const refused = new LibraryError("http", "The server answered 403 for /data/library.json.")
    expect(explainError(refused).title).toBe(`${CLI_NAME} serve answered 403 — see its terminal`)
    expect(explainError(new Error("boom")).title).toBe("Something went wrong")
  })

  it("says a route names nothing, in the page's own words", () => {
    render(<NotInLibrary what="article" name="gone2024" />)
    expect(screen.getByRole("heading", { level: 1, name: "No such article" })).toBeInTheDocument()
    expect(screen.getByText("gone2024").tagName).toBe("CODE")
    expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/")
  })
})

describe("the top bar's model", () => {
  it("names a bibliography by its short name", () => {
    expect(bibLabel({ name: "ml", short: "ML methods", title: "Learning methods" })).toBe(
      "ML methods"
    )
    expect(bibLabel({ name: "ml", short: "", title: "Learning methods" })).toBe("Learning methods")
  })

  it("keeps the bibliographies as links only when they fit", () => {
    expect(bibsFitInline(["Grassland", "Epidemiology", "ML methods", "Soil"])).toBe(true)
    expect(bibsFitInline(["A", "B", "C", "D", "E"])).toBe(true)
    expect(bibsFitInline(["A", "B", "C", "D", "E", "F"])).toBe(false)
    expect(
      bibsFitInline(["A very long bibliography title", "Another long one", "And a third"])
    ).toBe(false)
    expect(bibsFitInline([])).toBe(false)
  })

  it("knows where the reader is", () => {
    const p = (s: string) => new URLSearchParams(s)
    expect(navPlace("/", p(""))).toEqual({ kind: "today" })
    expect(navPlace("/inbox/", p("view=new"))).toEqual({ kind: "inbox" })
    expect(navPlace("/bib/", p("b=ml"))).toEqual({ kind: "bib", bib: "ml", page: true })
    expect(navPlace("/article/", p("b=ml&k=x"))).toEqual({ kind: "bib", bib: "ml", page: false })
    expect(navPlace("/nowhere/", p(""))).toEqual({ kind: "other" })
  })
})

describe("the top bar", () => {
  it("links Today, the inbox with its count and every bibliography with its own", async () => {
    setNavigation({ pathname: "/bib/", search: "b=ml" })
    await renderWithApp(<TopBar />)
    const nav = screen.getByRole("navigation", { name: "Main" })
    expect(within(nav).getByRole("link", { name: "Today" })).toHaveAttribute("href", "/")
    // The fixture's last run found nothing new: the waiting papers, muted.
    expect(within(nav).getByRole("link", { name: "Inbox 6 waiting" })).toHaveAttribute(
      "href",
      "/inbox/"
    )
    const ml = within(nav).getByRole("link", { name: "ML methods 3 articles" })
    expect(ml).toHaveAttribute("href", "/bib/?b=ml")
    expect(ml).toHaveAttribute("aria-current", "page")
    expect(within(nav).getByRole("link", { name: "Grassland 4 articles" })).not.toHaveAttribute(
      "aria-current"
    )
    const wordmark = APP_NAME.slice(0, 1).toUpperCase() + APP_NAME.slice(1)
    expect(screen.getByRole("link", { name: wordmark })).toHaveAttribute("href", "/")
  })

  it("shows the papers of the latest run in the inbox's count", async () => {
    const lib = fixtureLibrary()
    lib.inbox!.last_run = "2026-11-08T07:00:00"
    await renderWithApp(<TopBar />, { library: lib })
    expect(screen.getByRole("link", { name: "Inbox 6 new, 6 waiting" })).toBeInTheDocument()
  })

  it("marks the bibliography of an article as where the reader is", async () => {
    setNavigation({ pathname: "/article/", search: "b=grassland&k=lindqvist2026" })
    await renderWithApp(<TopBar />)
    const nav = screen.getByRole("navigation", { name: "Main" })
    expect(within(nav).getByRole("link", { name: "Grassland 4 articles" })).toHaveAttribute(
      "aria-current",
      "true"
    )
  })

  it("leaves the search out of the bar on the search page (its field is the page)", async () => {
    setNavigation({ pathname: "/search/", search: "q=filter" })
    await renderWithApp(<TopBar />)
    expect(screen.queryByRole("button", { name: "Search the library" })).toBeNull()
    const nav = screen.getByRole("navigation", { name: "Main" })
    expect(within(nav).getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current")
  })

  it("opens the palette from its search button", async () => {
    const user = userEvent.setup()
    function Open() {
      return <p>{useCommandPalette().open ? "open" : "closed"}</p>
    }
    await renderWithApp(
      <>
        <TopBar />
        <Open />
      </>
    )
    const buttons = screen.getAllByRole("button", { name: "Search the library" })
    expect(buttons[0]).toHaveAttribute("aria-keyshortcuts", "Meta+K Control+K")
    await user.click(buttons[0]!)
    expect(screen.getByText("open")).toBeInTheDocument()
  })
})

describe("the app's keys", () => {
  function Open() {
    return <p>{useCommandPalette().open ? "palette open" : "palette closed"}</p>
  }

  function renderKeys(page: React.ReactNode = null) {
    return render(
      <CommandPaletteProvider>
        <GlobalKeys />
        <Open />
        {page}
      </CommandPaletteProvider>
    )
  }

  it("goes to a page with a g chord", async () => {
    const user = userEvent.setup()
    renderKeys()
    await user.keyboard("gi")
    expect(router.push).toHaveBeenLastCalledWith("/inbox/")
    await user.keyboard("gt")
    expect(router.push).toHaveBeenLastCalledWith("/")
    await user.keyboard("gs")
    expect(router.push).toHaveBeenLastCalledWith("/search/")
  })

  it("goes to the n-th bibliography with g and a digit", async () => {
    const user = userEvent.setup()
    primeLibrary(fixtureLibrary())
    renderKeys()
    await user.keyboard("g2")
    await act(async () => {})
    expect(router.push).toHaveBeenLastCalledWith("/bib/?b=ml")
    primeLibrary(null)
  })

  it("swallows a key after g that means nothing, so it never acts on the page", async () => {
    const user = userEvent.setup()
    const onKey = vi.fn()
    renderKeys()
    window.addEventListener("keydown", onKey)
    await user.keyboard("ga")
    window.removeEventListener("keydown", onKey)
    expect(router.push).not.toHaveBeenCalled()
    expect(onKey.mock.calls.every(([e]) => (e as KeyboardEvent).defaultPrevented)).toBe(true)
  })

  it("does nothing while typing", async () => {
    const user = userEvent.setup()
    renderKeys(<input aria-label="A field" />)
    await user.type(screen.getByRole("textbox", { name: "A field" }), "gi/")
    expect(router.push).not.toHaveBeenCalled()
    expect(screen.getByText("palette closed")).toBeInTheDocument()
  })

  it("forgets a chord after a second", async () => {
    vi.useFakeTimers({ toFake: ["performance"] })
    try {
      renderKeys()
      const press = (key: string) =>
        window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
      press("g")
      vi.advanceTimersByTime(1200)
      press("i")
      expect(router.push).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("/ focuses the page's filter, else opens the search palette", async () => {
    const user = userEvent.setup()
    const { unmount } = renderKeys()
    await user.keyboard("/")
    expect(screen.getByText("palette open")).toBeInTheDocument()
    unmount()

    renderKeys(<input aria-label="Filter" data-page-filter defaultValue="soil" />)
    await user.keyboard("/")
    const field = screen.getByRole("textbox", { name: "Filter" })
    expect(field).toHaveFocus()
    expect((field as HTMLInputElement).selectionEnd).toBe(4)
    expect(screen.getByText("palette closed")).toBeInTheDocument()
  })
})

describe("the page's frame", () => {
  it("titles a page in one line, with its meta and actions", () => {
    render(
      <PageHeader
        title="Invented bibliography"
        meta="3 articles · 2020–2026"
        description="What it holds."
        actions={<button type="button">Act</button>}
      />
    )
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Invented bibliography")
    expect(screen.getByText("3 articles · 2020–2026")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument()
  })

  it("draws a skeleton busy and without a heading or any text", () => {
    for (const variant of ["today", "hub", "article", "search", "inbox"] as const) {
      const { container, unmount } = render(<PageSkeleton variant={variant} />)
      const status = screen.getByRole("status")
      expect(status).toHaveAttribute("aria-busy", "true")
      expect(screen.queryByRole("heading")).not.toBeInTheDocument()
      expect(container.textContent).toBe("Loading the library…")
      unmount()
    }
  })
})
