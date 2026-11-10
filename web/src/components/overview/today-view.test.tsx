import { act, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EntryFocus } from "@/components/shell/entry-focus"
import { resetPageEntries } from "@/hooks/page-entry"
import { indexLibrary, parseLibrary, primeLibrary, type Library } from "@/lib/data"
import { queueDecision, resetDecisions } from "@/lib/inbox-decisions"
import { countInboxViews } from "@/lib/inbox-views"
import { RELEVANCE } from "@/lib/labels"

import { fixtureJson, fixtureLibrary } from "../../../tests/utils/fixture"
import { renderWithApp } from "../../../tests/utils/render"

import { contentsEntry, sentenceNumber } from "./today-data"
import { TodayView } from "./today-view"

/** The day after the fixture's latest run: its papers were found before it (nothing new). */
function dayAfterRun(data: Library = fixtureLibrary()): Date {
  const day = new Date(`${data.inbox!.last_run.slice(0, 10)}T09:00:00`)
  day.setDate(day.getDate() + 1)
  return day
}

/** The fixture with its latest run on the morning its papers were found (all of them new). */
function morningOfRun(): { data: Library; now: Date } {
  const data = fixtureLibrary()
  const day = data.inbox!.papers[0]!.found
  data.inbox!.last_run = `${day}T07:30:12`
  return { data, now: new Date(`${day}T09:00:00`) }
}

function Page() {
  return (
    <>
      <main id="main" tabIndex={-1}>
        <TodayView />
      </main>
      <EntryFocus />
    </>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(dayAfterRun())
})

afterEach(() => {
  vi.useRealTimers()
  primeLibrary(null)
  resetDecisions()
  resetPageEntries()
})

describe("TodayView: the sentence", () => {
  it("opens with what the library holds and what the inbox found, its links named", async () => {
    const data = fixtureLibrary()
    const counts = countInboxViews(data.inbox)
    await renderWithApp(<TodayView />)
    const h1 = screen.getByRole("heading", { level: 1 })
    expect(h1).toHaveTextContent(
      `${sentenceNumber(data.bibliographies.length)} bibliographies, 7 articles. Yesterday the ` +
        `inbox found nothing new; ${counts.waiting} papers wait, ${counts.inScope} of them in scope.`
    )
    expect(within(h1).getByRole("link", { name: `${counts.waiting} papers wait` })).toHaveAttribute(
      "href",
      "/inbox/?view=waiting"
    )
    expect(
      within(h1).getByRole("link", { name: `${counts.inScope} of them in scope` })
    ).toHaveAttribute("href", "/inbox/?view=worth")
    expect(within(h1).getByRole("link", { name: /accepted paper waits/ })).toHaveAttribute(
      "href",
      "/inbox/?view=accepted"
    )
  })

  it("names the new papers of a run this morning, their count in rubric", async () => {
    const { data, now } = morningOfRun()
    vi.setSystemTime(now)
    const counts = countInboxViews(data.inbox)
    await renderWithApp(<TodayView />, { library: data })
    const link = screen.getByRole("link", { name: `${counts.new} new papers` })
    expect(link).toHaveAttribute("href", "/inbox/?view=new")
    expect(link.closest("h1")).toHaveTextContent("This morning the inbox found")
    expect(within(link).getByText(String(counts.new))).toHaveClass("text-rubric")
  })

  it("counts this session's decisions, like the top bar", async () => {
    const data = fixtureLibrary()
    const counts = countInboxViews(data.inbox)
    const best = data.inbox!.papers.find((p) => p.status === "new" && p.triage.relevance === 3)!
    await renderWithApp(<TodayView />)
    expect(screen.getByRole("link", { name: `${counts.waiting} papers wait` })).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: new RegExp(best.title.slice(0, 20)) })
    ).toBeInTheDocument()

    act(() => {
      queueDecision([best.id], "reject", { send: vi.fn() })
    })
    expect(
      screen.getByRole("link", { name: `${counts.waiting - 1} papers wait` })
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("none in scope")
    expect(screen.queryByRole("link", { name: new RegExp(best.title.slice(0, 20)) })).toBeNull()
  })
})

describe("TodayView: the inbox", () => {
  it("lists the best papers of the view the inbox opens on, and starts the triage", async () => {
    const data = fixtureLibrary()
    const counts = countInboxViews(data.inbox)
    await renderWithApp(<TodayView />)
    // Nothing new since the latest run: the papers worth a look (relevance 2 or 3).
    const section = screen.getByRole("region", { name: "Worth a look" })
    // The count is the sentence's alone: the heading says no number.
    expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent(/^Worth a look$/)
    const rows = within(section).getAllByRole("listitem")
    expect(rows).toHaveLength(counts.worth)
    const worth = data.inbox!.papers.filter(
      (p) => p.status === "new" && (p.triage.relevance ?? 0) >= 2
    )
    const first = worth.find((p) => p.triage.relevance === 3)!
    expect(within(rows[0]!).getByRole("img", { name: /Relevance 3 of 3/ })).toBeInTheDocument()
    expect(within(rows[0]!).getByRole("link")).toHaveAttribute(
      "href",
      `/inbox/?view=worth&p=${first.id}`
    )
    expect(within(rows[0]!).getByRole("link")).toHaveTextContent(first.title)
    const target = data.bibliographies.find((b) => b.name === first.triage.bib)!
    expect(rows[0]).toHaveTextContent(`${target.short} · `)
    expect(within(rows[0]!).getByRole("img").getAttribute("aria-label")).toContain(
      RELEVANCE[3].label
    )
    const triage = within(section).getByRole("link", { name: "Start triage" })
    expect(triage).toHaveAttribute("href", "/inbox/?view=worth")
    // A quiet control (no ink slab), with no key chips beside it.
    expect(triage).toHaveAttribute("data-variant", "default")
    expect(section.querySelector("kbd")).toBeNull()
  })

  it("shows the latest run's papers under New in the inbox", async () => {
    const { data, now } = morningOfRun()
    vi.setSystemTime(now)
    const counts = countInboxViews(data.inbox)
    await renderWithApp(<TodayView />, { library: data })
    const section = screen.getByRole("region", { name: "New in the inbox" })
    expect(within(section).getAllByRole("listitem")).toHaveLength(Math.min(5, counts.new))
    expect(within(section).getByRole("link", { name: "Start triage" })).toHaveAttribute(
      "href",
      "/inbox/?view=new"
    )
  })

  it("gives the focus to Start triage on arrival", async () => {
    await renderWithApp(<Page />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    expect(screen.getByRole("link", { name: "Start triage" })).toHaveFocus()
  })

  it("gives the focus back to Start triage on g t from Today itself", async () => {
    await renderWithApp(<Page />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    const bib = screen.getAllByRole("heading", { level: 3 })[0]!.querySelector("a")!
    bib.focus()
    fireEvent.keyDown(bib, { key: "g" })
    fireEvent.keyDown(bib, { key: "t" })
    expect(screen.getByRole("link", { name: "Start triage" })).toHaveFocus()

    // Typing a g and a t in a field is no chord.
    const field = document.createElement("input")
    document.body.append(field)
    field.focus()
    fireEvent.keyDown(field, { key: "g" })
    fireEvent.keyDown(field, { key: "t" })
    expect(field).toHaveFocus()
    field.remove()
  })

  it("says when nothing waits, and how to run the inbox", async () => {
    const data = fixtureLibrary()
    data.inbox!.papers = data.inbox!.papers.filter((p) => p.status !== "new")
    await renderWithApp(<TodayView />, { library: data })
    const section = screen.getByRole("region", { name: "Inbox" })
    expect(section).toHaveTextContent("Nothing waits for a decision")
    expect(within(section).getByText("glossator inbox run")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Start triage" })).toBeNull()
  })
})

describe("TodayView: the contents", () => {
  it("lists every bibliography with its count, scope and meta line", async () => {
    const data = fixtureLibrary()
    await renderWithApp(<TodayView />)
    const section = screen.getByRole("region", { name: "Bibliographies" })
    // A contents page: no column heads on screen ("Bibliographies … Articles").
    expect(within(section).getByRole("heading", { level: 2 })).toHaveClass("sr-only")
    expect(within(section).queryByText("Articles", { exact: true })).toBeNull()
    const titles = within(section).getAllByRole("heading", { level: 3 })
    expect(titles.map((h) => h.textContent)).toEqual(data.bibliographies.map((b) => b.title))
    for (const bib of data.bibliographies) {
      const entry = within(section).getByRole("link", { name: bib.title }).closest("li")!
      expect(within(section).getByRole("link", { name: bib.title })).toHaveAttribute(
        "href",
        `/bib/?b=${bib.name}`
      )
      expect(entry).toHaveTextContent(
        `${bib.articles.length} ${bib.articles.length === 1 ? "article" : "articles"}`
      )
      expect(entry).toHaveTextContent(bib.scope)
    }

    const grass = data.bibliographies[0]!
    const e = contentsEntry(grass)
    const meta = within(section).getByText(`${e.years!.from}–${e.years!.to}`).closest("p")!
    expect(meta).toHaveTextContent(
      `${e.years!.from}–${e.years!.to} · 1 draft · 1 retracted · 1 corrected · 1 unreadable record`
    )
    const retracted = e.notices[0]!.only!
    expect(
      within(meta).getByRole("link", { name: `1 retracted: ${retracted.cite}` })
    ).toHaveAttribute("href", `/article/?b=${grass.name}&k=${retracted.key}`)
  })

  it("tells how to fill an empty bibliography", async () => {
    const data = fixtureLibrary()
    const empty = data.bibliographies.find((b) => b.articles.length === 0)!
    await renderWithApp(<TodayView />)
    const entry = screen.getByRole("link", { name: empty.title }).closest("li")!
    expect(entry).toHaveTextContent("No article yet")
    expect(
      within(entry).getByText(`glossator curate <DOI> --bib ${empty.name}`)
    ).toBeInTheDocument()
    expect(within(entry).getByRole("button", { name: /^Copy: / })).toBeInTheDocument()
  })
})

describe("TodayView: recently published", () => {
  it("lists the recent articles by year, title first, with notices and drafts", async () => {
    const lib = indexLibrary(fixtureLibrary())
    await renderWithApp(<TodayView />)
    const section = screen.getByRole("region", { name: "Recently published" })
    const years = within(section)
      .getAllByRole("heading", { level: 3 })
      .map((h) => Number(h.textContent))
    expect(years).toEqual([...years].sort((a, b) => b - a))

    const retracted = lib.articles.find((e) =>
      e.article.notices.some((n) => n.type === "retraction")
    )!
    const link = within(section).getByRole("link", { name: retracted.article.title })
    expect(link).toHaveAttribute(
      "href",
      `/article/?b=${retracted.bib.name}&k=${retracted.article.key}&from=%2F`
    )
    expect(link.closest("li")).toHaveTextContent("Retracted")
    expect(link.closest("li")).toHaveTextContent(retracted.article.one_line)

    const draft = lib.articles.find((e) => e.article.status !== "complete")!
    const draftItem = within(section).getByRole("link", { name: draft.article.title }).closest("li")
    expect(draftItem).toHaveTextContent("Draft")
    expect(draftItem).toHaveTextContent("Being curated.")
  })

  it("ends with when the data was built and the inbox ran", async () => {
    const data = fixtureLibrary()
    await renderWithApp(<TodayView />)
    const times = screen.getByText(/^Data built/).querySelectorAll("time")
    expect([...times].map((t) => t.getAttribute("dateTime"))).toEqual([
      data.built,
      data.inbox!.last_run,
    ])
  })
})

describe("TodayView: other libraries", () => {
  it("says quietly which records it could not read, and shows the rest", async () => {
    const json = structuredClone(fixtureJson) as {
      bibliographies: { name: string; title: string; articles: Record<string, unknown>[] }[]
      inbox: { papers: Record<string, unknown>[] }
    }
    const bib = json.bibliographies[1]!
    bib.articles[0]!.year = { not: "a year" }
    json.inbox.papers[0]!.status = "maybe"
    primeLibrary(parseLibrary(json))
    await renderWithApp(<TodayView />, { library: null })
    const notice = screen.getByText(/2 records could not be read and are left out/)
    expect(notice).toHaveTextContent(`${bib.name}/${String(bib.articles[0]!.key)}`)
    expect(notice).toHaveTextContent(String(json.inbox.papers[0]!.id))
    const section = screen.getByRole("region", { name: "Bibliographies" })
    expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(
      json.bibliographies.length
    )
  })

  it("says what to do without bibliographies or inbox", async () => {
    const data = fixtureLibrary()
    data.bibliographies = []
    data.inbox = null
    await renderWithApp(<TodayView />, { library: data })
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("No bibliography yet.")
    expect(screen.getByText("No bibliography yet")).toBeInTheDocument()
    expect(screen.getByText("glossator build")).toBeInTheDocument()
    expect(screen.getByText(/No inbox on this computer/)).toBeInTheDocument()
    expect(screen.getByText("glossator inbox init")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Recently published" })).toBeNull()
  })
})
