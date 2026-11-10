import { act, fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetStatusLine } from "@/components/shell/status-line"
import type { InboxPaper, Library } from "@/lib/data"
import { flushDecisions, resetDecisions } from "@/lib/inbox-decisions"
import { latestRunDay } from "@/lib/inbox-views"
import { RELEVANCE } from "@/lib/labels"
import { guessLang } from "@/lib/lang"
import { commands, DECISION_HEADER } from "@/lib/site"
import { typeset } from "@/lib/typeset"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import { setNavigation } from "../../../tests/utils/navigation"
import { renderWithApp } from "../../../tests/utils/render"

import { resetFailedDecisions } from "./decide"
import { foundAgo, hookOf, shortTitle, sortRows } from "./inbox-model"
import { InboxView } from "./inbox-view"

interface Sent {
  url: string
  init: RequestInit | undefined
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** A fake glossator serve: /api/status answers, decisions are done (or answered by `decide`). */
function mockApi(decide?: (ids: string[], decision: string) => Response | Promise<Response>) {
  const sent: Sent[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({ url, init })
      if (url.startsWith("/api/status")) return json({ semantic: false })
      if (url === "/api/inbox/decide") {
        const body = JSON.parse(String(init?.body)) as { ids: string[]; decision: string }
        if (decide) return decide(body.ids, body.decision)
        const status = body.decision === "accept" ? "accepted" : "rejected"
        return json({ done: body.ids.map((id) => `${id}: ${status}`) })
      }
      return json({ error: "no such API" }, 404)
    })
  )
  return sent
}

const decisions = (sent: Sent[]) =>
  sent
    .filter((s) => s.url === "/api/inbox/decide")
    .map((s) => JSON.parse(String(s.init?.body)) as { ids: string[]; decision: string })

/** The layout of a wide screen (a list beside the reading pane) or a narrow one. */
function screenWidth(wide: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: wide ? query === "(min-width: 64rem)" || query === "(min-width: 80rem)" : false,
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

async function renderInbox(search = "", library?: Library) {
  setNavigation({ pathname: "/inbox/", search })
  const onUrlUpdate = vi.fn()
  const view = await renderWithApp(<InboxView />, { search, onUrlUpdate, library })
  // Let the API probe settle.
  await act(async () => {})
  return { ...view, onUrlUpdate }
}

// ---------------------------------------------------------------------------- the fixture's facts

const lib = fixtureLibrary()
const all = lib.inbox!.papers
const undecided = all.filter((p) => p.status === "new")
const sorted = (list: InboxPaper[]) =>
  sortRows(
    list.map((paper) => ({ paper })),
    "relevance"
  ).map((r) => r.paper)
/** Worth a look: undecided, related or in scope (the fixture's latest run found nothing new). */
const worth = sorted(undecided.filter((p) => (p.triage.relevance ?? -1) >= 2))
/** The paper triaged in another language than English (Spanish in the fixture). */
const spanish = undecided.find((p) => p.triage.summary && /[áíóñ]/.test(p.triage.summary))!
const accepted = all.find((p) => p.status === "accepted")!
const rejected = all.find((p) => p.status === "rejected")!
const gated = all.find((p) => p.triage.by === "prior")!
const untriaged = all.find((p) => p.triage.relevance === null)!

/** A title as the page sets it (typographic spaces and quotes). */
const shown = (title: string) => typeset(title, guessLang(title))
const bibLabel = (name: string) => {
  const b = lib.bibliographies.find((x) => x.name === name)!
  return b.short || b.title
}

const feed = () => screen.getByRole("feed", { name: "Papers in this view" })
const items = () => within(feed()).getAllByRole("article")
const titles = () => items().map((a) => within(a).getByRole("heading", { level: 2 }).textContent)
const row = (p: InboxPaper) =>
  items().find((a) => within(a).getByRole("heading", { level: 2 }).textContent === shown(p.title))
const pane = () => document.getElementById("inbox-reading-pane")!
const line = () => document.querySelector("[data-slot=status-line]")!
const lastUrl = (spy: ReturnType<typeof vi.fn>) =>
  String((spy.mock.calls.at(-1)?.[0] as { queryString: string } | undefined)?.queryString ?? "")

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
/** Send the decisions waiting for their Undo delay now (what leaving the page does). */
async function sendNow() {
  await act(async () => {
    flushDecisions()
  })
  await settle()
}

beforeEach(() => {
  resetDecisions()
  resetFailedDecisions()
  resetStatusLine()
  screenWidth(true)
})
afterEach(() => {
  resetDecisions()
  resetFailedDecisions()
  resetStatusLine()
})

describe("InboxView", () => {
  it("opens on Worth a look when the latest run found nothing new, grouped by relevance", async () => {
    mockApi()
    await renderInbox()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Inbox")
    const views = screen.getByRole("navigation", { name: "Views" })
    expect(within(views).getByRole("link", { name: /Worth a look/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(within(views).getByRole("link", { name: /^New/ })).toHaveTextContent("0")
    expect(within(views).getByRole("link", { name: /All waiting/ })).toHaveTextContent(
      String(undecided.length)
    )
    expect(titles()).toEqual(worth.map((p) => shown(p.title)))
    // Group headings name the relevance, with the count of the papers under them.
    const inScope = worth.filter((p) => p.triage.relevance === 3).length
    expect(feed()).toHaveTextContent(`${RELEVANCE[3].label}·${inScope}`)
    // No stars, no meters, no per-row icons: a mark in the gutter that says its words.
    const first = row(worth[0]!)!
    expect(within(first).getByRole("img", { name: "Relevance 3 of 3: In scope" })).toBeVisible()
    expect(first.querySelectorAll("svg")).toHaveLength(0)
    expect(within(first).queryByRole("meter")).toBeNull()
  })

  it("opens on New when the latest run found papers", async () => {
    mockApi()
    const library = fixtureLibrary()
    const day = latestRunDay(library.inbox)!
    const found = library.inbox!.papers.filter((p) => p.status === "new").slice(0, 2)
    for (const p of found) p.found = day
    await renderInbox("", library)
    const views = screen.getByRole("navigation", { name: "Views" })
    expect(within(views).getByRole("link", { name: /^New/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(new Set(titles())).toEqual(new Set(found.map((p) => shown(p.title))))
  })

  it("cycles the views with v, the URL saying which", async () => {
    mockApi()
    const { onUrlUpdate } = await renderInbox()
    const user = userEvent.setup()
    await user.keyboard("v")
    expect(lastUrl(onUrlUpdate)).toContain("view=waiting")
    expect(items()).toHaveLength(undecided.length)
    await user.keyboard("v")
    expect(titles()).toEqual([shown(accepted.title)])
  })

  it("shows the current paper as a glossed page: summary, reason, kind; the rest folded", async () => {
    mockApi()
    await renderInbox(`?p=${spanish.id}`)
    const here = within(pane())
    expect(here.getByRole("heading", { level: 2 }).textContent).toBe(shown(spanish.title))
    const summary = document.getElementById("inbox-reading-pane-summary")!
    expect(summary).toHaveAttribute("lang", "es")
    // The reason, in italic, without a "Why:" before it.
    const why = here.getByText(spanish.triage.why!)
    expect(why.closest("p")).toHaveAttribute("lang", "es")
    expect(pane()).not.toHaveTextContent("Why:")
    // The prior names the triage's own bibliography: it says nothing more, and is left out; where
    // the paper was found is in the details, not repeated in the margin.
    expect(spanish.prior!.bib).toBe(spanish.triage.bib)
    expect(here.queryByRole("meter")).toBeNull()
    const gloss = here.getByRole("complementary", { name: "Why it is here" })
    expect(gloss).not.toHaveTextContent(/found by/)
    // The terminal commands are folded away in the details.
    const details = pane().querySelector("details")!
    expect(details).not.toHaveAttribute("open")
    expect(within(details).getByText(commands.inboxAccept(spanish.id))).toBeInTheDocument()
    // The decision bar names where Accept files it.
    expect(here.getByRole("button", { name: /^Accept/ })).toHaveTextContent(
      `→ ${bibLabel(spanish.triage.bib!)}`
    )
    expect(here.getByRole("button", { name: /^Accept/ })).toHaveAttribute("aria-keyshortcuts", "a")
    expect(here.getByRole("button", { name: /^Reject/ })).toHaveAttribute("aria-keyshortcuts", "r")
  })

  it("names the closest bibliography only when it is not the triage's", async () => {
    mockApi()
    const library = fixtureLibrary()
    const other = library.bibliographies.find((b) => b.name !== spanish.triage.bib)!
    const p = library.inbox!.papers.find((x) => x.id === spanish.id)!
    p.prior = { ...p.prior!, bib: other.name }
    await renderInbox(`?p=${spanish.id}`, library)
    const gloss = within(pane()).getByRole("complementary", { name: "Why it is here" })
    expect(within(gloss).getByRole("meter", { name: /Prior, closeness to/ })).toHaveAttribute(
      "aria-valuenow",
      String(p.prior.score)
    )
    expect(gloss).toHaveTextContent(`closest to ${other.short || other.title}`)
  })

  it("says when Haiku never read a paper, and when it is not triaged", async () => {
    mockApi()
    await renderInbox(`?view=waiting&p=${gated.id}`)
    expect(within(pane()).getByText(/^Never read by Haiku/)).toBeVisible()
    const user = userEvent.setup()
    await user.click(row(untriaged)!)
    expect(within(pane()).getByText(/^Not triaged yet: the next run/)).toBeVisible()
    expect(within(row(untriaged)!).getByRole("img", { name: "Relevance: not rated" })).toBeVisible()
  })

  it("names the library's articles a citing paper cites, as links", async () => {
    mockApi()
    const library = fixtureLibrary()
    const bib = library.bibliographies.find((b) => b.articles.length > 1)!
    const [a, b] = bib.articles
    const p = library.inbox!.papers.find((x) => x.id === worth[0]!.id)!
    p.sources = ["citations"]
    p.queries = [`${bib.name}: cites ${a!.key}, ${b!.key}, unknown2020`]
    await renderInbox(`?p=${p.id}`, library)
    const gloss = within(pane()).getByRole("complementary", { name: "Why it is here" })
    expect(gloss).toHaveTextContent("Cites 3 of your articles:")
    const link = within(gloss).getByRole("link", {
      name: new RegExp(`^${a!.cite.split(/[ ,&]/)[0]}`),
    })
    expect(link.getAttribute("href")).toMatch(
      new RegExp(`^/article/\\?b=${bib.name}&k=${a!.key}&from=`)
    )
    expect(within(gloss).getByText("unknown2020")).toBeVisible()
  })

  it("moves with j and k, keeps one row in the tab order, follows the paper in the URL", async () => {
    mockApi()
    const { onUrlUpdate } = await renderInbox()
    const user = userEvent.setup()
    // The first paper has the focus on arrival: keys work at once.
    expect(document.activeElement).toBe(items()[0])
    expect(items().filter((a) => a.tabIndex === 0)).toHaveLength(1)
    await user.keyboard("j")
    expect(document.activeElement).toBe(items()[1])
    expect(items()[1]).toHaveAttribute("tabindex", "0")
    expect(items()[0]).toHaveAttribute("tabindex", "-1")
    expect(lastUrl(onUrlUpdate)).toContain(`p=${worth[1]!.id}`)
    expect(within(pane()).getByRole("heading", { level: 2 }).textContent).toBe(
      shown(worth[1]!.title)
    )
    await user.keyboard("jk")
    expect(document.activeElement).toBe(items()[1])
  })

  it("shows the whole abstract with Enter", async () => {
    mockApi()
    const withAbstract = worth.find((p) => p.abstract)!
    await renderInbox(`?p=${withAbstract.id}`)
    const user = userEvent.setup()
    await user.keyboard("{Enter}")
    expect(within(pane()).getByRole("button", { name: /Less of the abstract/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })

  it("scrolls the paper with Space and Shift+Space", async () => {
    mockApi()
    await renderInbox()
    const box = pane().firstElementChild as HTMLElement
    Object.defineProperty(box, "clientHeight", { value: 600 })
    const scrollBy = vi.fn()
    box.scrollBy = scrollBy as typeof box.scrollBy
    const user = userEvent.setup()
    await user.keyboard(" ")
    await user.keyboard("{Shift>} {/Shift}")
    expect(scrollBy.mock.calls.map((c) => Math.sign((c[0] as ScrollToOptions).top ?? 0))).toEqual([
      1, -1,
    ])
  })

  it("keeps its letters to the list, the pane and the page (WCAG 2.1.4)", async () => {
    const sent = mockApi()
    await renderInbox()
    const user = userEvent.setup()
    // On another control (the toolbar's Select), a and r decide nothing.
    const select = screen.getByRole("button", { name: /^Select/ })
    select.focus()
    await user.keyboard("arj")
    expect(line()).toHaveTextContent("")
    expect(select).toHaveFocus()
    await sendNow()
    expect(decisions(sent)).toEqual([])
    // In the reading pane, they do.
    within(pane())
      .getByRole("button", { name: /^Reject/ })
      .focus()
    await user.keyboard("a")
    expect(line()).toHaveTextContent(`Accepted ‘${shortTitle(worth[0]!.title)}’`)
  })

  it("ignores the shortcuts while typing in the filter", async () => {
    const sent = mockApi()
    const { onUrlUpdate } = await renderInbox()
    const user = userEvent.setup()
    await user.keyboard("/")
    const box = screen.getByRole("searchbox", { name: "Filter the papers" })
    expect(box).toHaveFocus()
    await user.keyboard("zqx")
    expect(box).toHaveValue("zqx")
    expect(decisions(sent)).toEqual([])
    expect(screen.queryByRole("feed")).toBeNull()
    expect(screen.getByText("No paper of this view matches the filters")).toBeVisible()
    expect(onUrlUpdate).toHaveBeenCalled()
  })

  it("accepts with a: said in the status line with Undo, collapsed into Decided, sent after the delay", async () => {
    let answer!: (r: Response) => void
    const sent = mockApi(() => new Promise<Response>((res) => (answer = res)))
    await renderInbox()
    const user = userEvent.setup()
    const target = worth[0]!
    await user.keyboard("a")

    // At once: the row collapses into "Decided this session", the line offers Undo, the focus
    // moved on; nothing is sent yet.
    expect(row(target)).toBeUndefined()
    expect(document.activeElement).toBe(row(worth[1]!))
    expect(line()).toHaveTextContent(`Accepted ‘${shortTitle(target.title)}’`)
    expect(within(line() as HTMLElement).getByRole("button", { name: /Undo/ })).toHaveAttribute(
      "aria-keyshortcuts",
      "u"
    )
    const decided = screen.getByRole("button", { name: /Decided this session/ })
    expect(decided).toHaveTextContent("1")
    expect(decided).toHaveAttribute("aria-expanded", "false")
    expect(decisions(sent)).toEqual([])
    expect(screen.queryByRole("status", { name: /toast/i })).toBeNull()

    await sendNow()
    expect(decisions(sent)).toEqual([{ ids: [target.id], decision: "accept" }])
    const call = sent.find((s) => s.url === "/api/inbox/decide")!
    expect(new Headers(call.init?.headers).get(DECISION_HEADER)).toBe("1")
    expect(call.init?.keepalive).toBe(true)
    await act(async () => answer(json({ done: [`${target.id}: accepted`] })))
    await settle()
    expect(line()).toHaveTextContent(`Accepted ‘${shortTitle(target.title)}’`)
    // Opened, the group shows it with its state.
    await user.click(decided)
    const group = screen.getByRole("feed", { name: "Papers decided this session" })
    expect(within(group).getByRole("article")).toHaveTextContent("Accepted")
  })

  it("undoes a decision with the status line's Undo or u: nothing is sent", async () => {
    const sent = mockApi()
    await renderInbox()
    const user = userEvent.setup()
    const target = worth[0]!
    await user.keyboard("r")
    expect(row(target)).toBeUndefined()
    await user.click(within(line() as HTMLElement).getByRole("button", { name: /Undo/ }))
    await settle()
    expect(row(target)).toBeDefined()
    expect(line()).toHaveTextContent(`Undone: ‘${shortTitle(target.title)}’ is back in the list`)
    // The paper is the current one again, and holds the focus.
    expect(document.activeElement).toBe(row(target))

    await user.keyboard("r")
    expect(row(target)).toBeUndefined()
    await user.keyboard("u")
    await settle()
    expect(row(target)).toBeDefined()
    await sendNow()
    expect(decisions(sent)).toEqual([])
    // Nothing left to undo: said in the status line.
    await user.keyboard("u")
    expect(line()).toHaveTextContent("Nothing to undo")
  })

  it("decides once for a key held down or a double click", async () => {
    const sent = mockApi()
    await renderInbox()
    fireEvent.keyDown(document.activeElement!, { key: "a" })
    fireEvent.keyDown(document.activeElement!, { key: "a", repeat: true })
    fireEvent.keyDown(document.activeElement!, { key: "a", repeat: true })
    await sendNow()
    expect(decisions(sent)).toEqual([{ ids: [worth[0]!.id], decision: "accept" }])
    // A double click's second click lands on the next paper's button: it is ignored.
    const reject = () => within(pane()).getByRole("button", { name: /^Reject/ })
    fireEvent.click(reject(), { detail: 1 })
    fireEvent.click(reject(), { detail: 2 })
    await sendNow()
    expect(decisions(sent).slice(1)).toEqual([{ ids: [worth[1]!.id], decision: "reject" }])
  })

  it("rolls a rejection back when the server refuses it, and says so once with a Retry", async () => {
    mockApi(() => json({ error: "a decision needs the header X-Glossator: 1" }, 403))
    await renderInbox()
    const target = worth[0]!
    await userEvent.click(within(pane()).getByRole("button", { name: /^Reject/ }))
    await sendNow()
    expect(row(target)).toBeDefined()
    expect(line()).toHaveTextContent(
      /^Not rejected: ‘.+’\. A decision needs the header X-Glossator: 1\./
    )
    expect(line().querySelector("p")).toHaveClass("text-danger")
    expect(within(line() as HTMLElement).getByRole("button", { name: "Retry" })).toBeVisible()
  })

  it("says which papers of a selection the server did not decide", async () => {
    mockApi((ids) => json({ done: [`${ids[0]}: rejected`, `${ids[1]}: no such item`] }))
    await renderInbox()
    const user = userEvent.setup()
    await user.keyboard("x")
    await user.keyboard("jx")
    await user.keyboard("r")
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Reject 2 papers" })
    )
    await sendNow()
    expect(line()).toHaveTextContent(
      `Not rejected: ‘${shortTitle(worth[1]!.title, 26)}’ (no such item).`
    )
    // The paper it did not reject is back in the list.
    expect(row(worth[1]!)).toBeDefined()
    expect(row(worth[0]!)).toBeUndefined()
  })

  it("reads the data again when a decision gets no answer (a 500), and says what was not saved", async () => {
    const sent = mockApi(() => json({ error: "OSError: no space left" }, 500))
    const fresh = fixtureLibrary()
    const fetcher = vi.mocked(fetch)
    const base = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url, init) =>
      String(url).startsWith("/data/library.json") ? json(fresh) : base(url, init)
    )
    await renderInbox()
    await userEvent.click(within(pane()).getByRole("button", { name: /^Reject/ }))
    await sendNow()
    await settle()
    expect(decisions(sent)).toHaveLength(1)
    expect(line()).toHaveTextContent(
      `Not rejected: ‘${shortTitle(worth[0]!.title, 26)}’ (not saved).`
    )
    expect(row(worth[0]!)).toBeDefined()
    // The API answered its probe: decisions stay possible.
    expect(screen.queryByText(`Decisions need ${commands.serve}`)).toBeNull()
  })

  it("says a decision may not be saved when the reply is empty and the data cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/status")) return json({ semantic: false })
        if (url === "/api/inbox/decide") return new Response("", { status: 200 })
        throw new TypeError("fetch failed")
      })
    )
    await renderInbox()
    await userEvent.click(within(pane()).getByRole("button", { name: /^Reject/ }))
    await sendNow()
    await settle()
    expect(line()).toHaveTextContent(/may not be rejected/)
    expect(row(worth[0]!)).toBeDefined()
  })

  it("asks before a decision on a selection (x shows the checkboxes), then queues it", async () => {
    const sent = mockApi()
    await renderInbox()
    const user = userEvent.setup()
    expect(within(items()[0]!).queryByRole("checkbox")).toBeNull()
    await user.keyboard("x")
    expect(within(items()[0]!).getByRole("checkbox")).toBeChecked()
    await user.keyboard("jx")
    expect(screen.getByRole("group", { name: "Selection" })).toHaveTextContent("2 selected")
    await user.keyboard("r")
    const dialog = screen.getByRole("alertdialog", { name: "Reject 2 papers?" })
    expect(within(dialog).getByText(shown(worth[0]!.title))).toBeVisible()
    await user.click(within(dialog).getByRole("button", { name: "Reject 2 papers" }))
    expect(items()).toHaveLength(worth.length - 2)
    expect(decisions(sent)).toEqual([])
    expect(line()).toHaveTextContent("Rejected 2 papers")
    await sendNow()
    expect(decisions(sent)).toEqual([{ ids: [worth[0]!.id, worth[1]!.id], decision: "reject" }])
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("group", { name: "Selection" })).toBeNull()
  })

  it("shows the shortcuts and the marks' legend with ?", async () => {
    mockApi()
    await renderInbox()
    await userEvent.keyboard("?")
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" })
    expect(within(dialog).getByText("Accept the selection, or the current paper")).toBeVisible()
    expect(within(dialog).getByText(/^Next view/)).toBeVisible()
    expect(within(dialog).getByText(new RegExp(`^${RELEVANCE[3].label}:`))).toBeVisible()
    expect(within(dialog).getByText(/^The prior/)).toBeVisible()
    // The legend lives there now: no Legend button on the page.
    expect(screen.queryByRole("button", { name: "Legend" })).toBeNull()
  })

  it("shows the commands to type when the API is not there", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed")
      })
    )
    await renderInbox(`?view=waiting&p=${worth[0]!.id}`)
    expect(screen.getByText(`Decisions need ${commands.serve}`)).toBeVisible()
    const bar = within(pane()).getByRole("group", { name: "Decide in a terminal" })
    expect(within(bar).queryByRole("button", { name: /^Accept/ })).toBeNull()
    expect(within(bar).getByText(commands.inboxAccept(worth[0]!.id))).toBeVisible()
    expect(within(bar).getByText(commands.inboxReject(worth[0]!.id))).toBeVisible()
  })

  it("reads its view, filters and order from the URL", async () => {
    mockApi()
    const bib = worth[0]!.triage.bib!
    await renderInbox(`?view=waiting&bib=${bib}&sort=title`)
    const expected = undecided
      .filter((p) => p.triage.bib === bib)
      .map((p) => p.title)
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
      .map(shown)
    expect(titles()).toEqual(expected)
    expect(screen.getByRole("button", { name: `Bibliography: ${bibLabel(bib)}` })).toBeVisible()
    expect(screen.getByRole("button", { name: "Order: By title" })).toBeVisible()
    // Sorted by title: no group headings.
    expect(feed()).not.toHaveTextContent(RELEVANCE[3].label)
    expect(screen.getByText(/match the filters/)).toBeVisible()
  })

  it("opens on the paper a link names, in its view", async () => {
    mockApi()
    await renderInbox(`?p=${accepted.id}`)
    const views = screen.getByRole("navigation", { name: "Views" })
    expect(within(views).getByRole("link", { name: /^Accepted/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(document.activeElement).toBe(row(accepted))
    expect(within(pane()).getByText(commands.addAccepted)).toBeVisible()
  })

  it("shows a linked paper that waits no more above the list", async () => {
    mockApi()
    await renderInbox(`?p=${rejected.id}&status=rejected`)
    expect(feed()).toHaveTextContent(/^Rejected·1/)
    expect(document.activeElement).toBe(row(rejected))
    expect(within(pane()).queryByRole("button", { name: /^Reject/ })).toBeNull()
    expect(within(pane()).getByRole("button", { name: /^Accept/ })).toBeVisible()
  })

  it("prints a plain list of the view", async () => {
    mockApi()
    const { container } = await renderInbox()
    const print = container.querySelector("section.print\\:block")!
    expect(print).toBeInTheDocument()
    for (const p of worth) expect(print).toHaveTextContent(p.title)
  })

  it("draws a long inbox as a window of papers, keeping the keys, the focus and the positions", async () => {
    mockApi()
    const library = fixtureLibrary()
    const model = library.inbox!.papers.find((x) => x.id === worth.at(-1)!.id)!
    library.inbox!.papers = Array.from({ length: 120 }, (_, i) => ({
      ...model,
      id: `synthetic${String(i).padStart(3, "0")}`,
      title: `Invented paper number ${i + 1}`,
      triage: { ...model.triage, relevance: 2 },
    }))
    // A list column 800 px tall (jsdom measures nothing).
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 800 })
    )
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400)
    await renderInbox("", library)
    const drawn = items()
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.length).toBeLessThan(120)
    expect(drawn[0]).toHaveAttribute("aria-setsize", "120")
    expect(drawn[0]).toHaveAttribute("aria-posinset", "1")
    const user = userEvent.setup()
    await user.keyboard("j")
    expect(document.activeElement).toHaveAttribute("aria-posinset", "2")
    await user.keyboard("{End}")
    expect(document.activeElement).toHaveAttribute("aria-posinset", "120")
    expect(document.activeElement).toHaveTextContent("Invented paper number 120")
    expect(items().filter((a) => a.tabIndex === 0)).toHaveLength(1)
    await user.keyboard("{Home}")
    expect(document.activeElement).toHaveAttribute("aria-posinset", "1")
  })

  it("shows each paper's hook and how long ago it was found", async () => {
    mockApi()
    await renderInbox("?view=waiting")
    for (const p of undecided) {
      const hook = hookOf(p.triage.summary)
      const r = row(p)!
      if (hook) expect(r.textContent).toContain(typeset(hook, guessLang(p.triage.summary)))
      expect(r).toHaveTextContent(foundAgo(p.found)!)
    }
  })

  it("gives the focus to the current paper after v and after a menu, never to the trigger", async () => {
    mockApi()
    await renderInbox()
    const user = userEvent.setup()
    await user.keyboard("j")
    const current = worth[1]!
    await user.keyboard("v")
    // All waiting holds the paper too: it keeps the focus there.
    await settle()
    expect(document.activeElement).toBe(row(current))
    await user.keyboard("s")
    const menu = screen.getByRole("menu")
    await user.click(within(menu).getByRole("menuitemradio", { name: "Title" }))
    await settle()
    expect(document.activeElement).toBe(row(current))
    expect(screen.getByRole("button", { name: /^Order/ })).not.toHaveFocus()
  })

  it("selects a whole group with Shift+X (or its heading's Select n), then decides it", async () => {
    const sent = mockApi()
    await renderInbox("?view=waiting")
    const user = userEvent.setup()
    // The sweep of the related ones.
    const related = sorted(undecided.filter((p) => p.triage.relevance === 2))
    await user.click(row(related[0]!)!)
    await user.keyboard("{Shift>}X{/Shift}")
    expect(screen.getByRole("group", { name: "Selection" })).toHaveTextContent(
      `${related.length} selected`
    )
    for (const p of related) expect(within(row(p)!).getByRole("checkbox")).toBeChecked()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("group", { name: "Selection" })).toBeNull()
    // The heading's pointer control does the same.
    const heading = within(feed()).getByText(RELEVANCE[2].label)
    await user.click(heading.parentElement!.querySelector("button")!)
    expect(screen.getByRole("group", { name: "Selection" })).toHaveTextContent(
      `${related.length} selected`
    )
    await user.keyboard("r")
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: `Reject ${related.length} papers`,
      })
    )
    await sendNow()
    expect(decisions(sent)).toEqual([{ ids: related.map((p) => p.id), decision: "reject" }])
  })

  it("collapses a group's heading with its last paper", async () => {
    mockApi()
    await renderInbox()
    expect(worth.filter((p) => p.triage.relevance === 3)).toHaveLength(1)
    const heading = () => within(feed()).getByText(RELEVANCE[3].label)
    expect(heading().closest("[data-collapsed]")).toBeNull()
    await userEvent.keyboard("a")
    // Drawn collapsed (and out of the accessibility tree) with the row it headed.
    expect(heading().closest("[data-collapsed]")).toHaveAttribute("aria-hidden", "true")
  })

  it("adds failures up: their rows say so, the line counts them and retries them all", async () => {
    const sent: Sent[] = []
    let failing = true
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/status")) return json({ semantic: false })
        if (url === "/api/inbox/decide") {
          sent.push({ url, init })
          if (failing) return json({ error: "OSError: no space left" }, 500)
          const body = JSON.parse(String(init?.body)) as { ids: string[] }
          return json({ done: body.ids.map((id) => `${id}: rejected`) })
        }
        throw new TypeError("fetch failed")
      })
    )
    await renderInbox()
    const user = userEvent.setup()
    await user.keyboard("r")
    await sendNow()
    await settle()
    await user.keyboard("r")
    await sendNow()
    await settle()
    expect(line()).toHaveTextContent(/^2 decisions not saved/)
    expect(row(worth[0]!)).toHaveTextContent("Reject not saved")
    expect(row(worth[1]!)).toHaveTextContent("Reject not saved")
    await user.click(row(worth[0]!)!)
    expect(within(pane()).getByText(/^Reject not saved/)).toBeVisible()
    // Retry all: both decided again (with an Undo), their marks gone.
    failing = false
    await user.click(within(line() as HTMLElement).getByRole("button", { name: "Retry all" }))
    expect(row(worth[0]!)).toBeUndefined()
    expect(row(worth[1]!)).toBeUndefined()
    await sendNow()
    expect(decisions(sent).at(-1)).toEqual({
      ids: expect.arrayContaining([worth[0]!.id, worth[1]!.id]),
      decision: "reject",
    })
  })

  it("says so when the library has no inbox", async () => {
    mockApi()
    const library = fixtureLibrary()
    library.inbox = null
    await renderInbox("", library)
    expect(screen.getByText("No inbox on this computer")).toBeVisible()
    expect(screen.getByText(commands.inboxInit)).toBeVisible()
  })
})

describe("InboxView on a narrow screen", () => {
  beforeEach(() => screenWidth(false))

  it("opens a paper on the whole screen with a tap (Back closes it)", async () => {
    mockApi()
    const { onUrlUpdate } = await renderInbox()
    const user = userEvent.setup()
    expect(document.getElementById("inbox-reading-pane")).toBeNull()
    await user.click(row(worth[0]!)!)
    const update = onUrlUpdate.mock.calls.at(-1)![0] as {
      queryString: string
      options: { history: string }
    }
    expect(update.queryString).toMatch(/read=true/)
    expect(update.options.history).toBe("push")
    expect(screen.queryByRole("feed")).toBeNull()
    expect(within(pane()).getByRole("heading", { level: 2 }).textContent).toBe(
      shown(worth[0]!.title)
    )
    // Back (the reader's own, which goes back in the history the tap made).
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    await user.click(screen.getByRole("button", { name: /Worth a look/ }))
    expect(back).toHaveBeenCalledOnce()
  })

  it("decides from the bar at the bottom, moves on, and returns to the row", async () => {
    const sent = mockApi()
    await renderInbox(`?p=${worth[0]!.id}&read=true`)
    const user = userEvent.setup()
    expect(document.activeElement).toBe(within(pane()).getByRole("heading", { level: 2 }))
    await user.click(within(pane()).getByRole("button", { name: /^Reject/ }))
    // On to the next paper, the status line just above the bar.
    expect(within(pane()).getByRole("heading", { level: 2 }).textContent).toBe(
      shown(worth[1]!.title)
    )
    expect(within(pane()).getByText(`Rejected ‘${shortTitle(worth[0]!.title)}’`)).toBeVisible()
    // A page opened on the reader closes it in place.
    await user.click(screen.getByRole("button", { name: /Worth a look/ }))
    expect(feed()).toBeVisible()
    expect(document.activeElement).toBe(row(worth[1]!))
    await sendNow()
    expect(decisions(sent)).toEqual([{ ids: [worth[0]!.id], decision: "reject" }])
  })
})
