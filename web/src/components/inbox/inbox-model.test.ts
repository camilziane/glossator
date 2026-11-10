import { describe, expect, it } from "vitest"

import type { InboxPaper } from "@/lib/data"
import { formatShortDate } from "@/lib/format"
import type { Override } from "@/lib/inbox-decisions"
import { latestRunDay } from "@/lib/inbox-views"
import { RELEVANCE } from "@/lib/labels"

import { fixtureLibrary } from "../../../tests/utils/fixture"
import {
  buildList,
  citedKeys,
  citesOf,
  facetCounts,
  facetOptions,
  filterRows,
  foundAgo,
  groupOf,
  hookOf,
  hasActiveFilters,
  inboxRows,
  kindLabel,
  kindWord,
  linkedLabel,
  matchesQuery,
  nextView,
  NO_FILTERS,
  parseQuery,
  ranWords,
  shortAuthors,
  shortTitle,
  sortRows,
  sourceLabel,
  sourceList,
  viewOf,
  type InboxRow,
} from "./inbox-model"

const lib = fixtureLibrary()
const inbox = lib.inbox!
const papers = inbox.papers
const day = latestRunDay(inbox)
const bibNames: ReadonlySet<string> = new Set(lib.bibliographies.map((b) => b.name))

function rows(overrides: ReadonlyMap<string, Override> = new Map()): InboxRow[] {
  return inboxRows(fixtureLibrary().inbox!.papers, overrides)
}

const ids = (list: readonly { paper: InboxPaper }[]) => list.map((r) => r.paper.id)
const waiting = papers.filter((p) => p.status === "new")
const worth = waiting.filter((p) => (p.triage.relevance ?? -1) >= 2)

function paper(over: Partial<InboxPaper> & { id: string }): InboxPaper {
  return {
    title: over.id,
    authors: [],
    venue: "",
    date: "",
    doi: "",
    url: "",
    pdf: "",
    pdf_online: "",
    abstract: "",
    status: "new",
    found: "2026-11-01",
    sources: ["openalex"],
    queries: [],
    triage: { bib: "ml", relevance: 1, kind: "method", summary: "s", why: "w", by: "haiku" },
    prior: null,
    ...over,
  }
}

describe("labels", () => {
  it("names kinds and sources", () => {
    expect(kindLabel("primary")).toBe("Primary study")
    expect(kindLabel("unknown")).toBe("No kind")
    expect(kindLabel("protocol")).toBe("Protocol")
    expect(kindWord("primary")).toBe("primary")
    expect(kindWord("other")).toBeNull()
    expect(kindWord(null)).toBeNull()
    expect(sourceLabel("biorxiv")).toBe("bioRxiv")
    expect(sourceLabel("somewhere")).toBe("somewhere")
    expect(sourceList(["openalex"])).toBe("OpenAlex")
    expect(sourceList(["openalex", "pubmed", "arxiv"])).toBe("OpenAlex, PubMed and arXiv")
  })

  it("shortens long author lists", () => {
    expect(shortAuthors(["A", "B", "C", "D"])).toBe("A, B, C, D")
    expect(shortAuthors(["A", "B", "C", "D", "E", "F"])).toBe("A, B, C + 3 more")
    expect(shortAuthors([])).toBe("")
  })

  it("cuts a long title at a word for a one-line message", () => {
    const long = papers.reduce((a, b) => (b.title.length > a.title.length ? b : a)).title
    const short = shortTitle(long)
    expect(short.endsWith("…")).toBe(true)
    expect(short.length).toBeLessThanOrEqual(41)
    expect(long.startsWith(short.slice(0, -1))).toBe(true)
    expect(short.slice(0, -1)).not.toMatch(/\s$/)
    // A title nearly short enough stays whole.
    expect(shortTitle("A title of forty-four characters, more or less")).toBe(
      "A title of forty-four characters, more or less"
    )
  })
})

describe("rows", () => {
  it("counts this session's decisions: decided when the status is not the data's", () => {
    const [a, b] = waiting
    const o = new Map<string, Override>([
      [a!.id, { status: "rejected", phase: "queued", batch: 1 }],
      [b!.id, { status: "new", phase: "done", batch: 2 }],
    ])
    const list = rows(o)
    const ra = list.find((r) => r.paper.id === a!.id)!
    const rb = list.find((r) => r.paper.id === b!.id)!
    expect(ra).toMatchObject({ status: "rejected", queued: true, pending: false, decided: true })
    // A decision the server did not save: the paper is what it was.
    expect(rb).toMatchObject({ status: "new", decided: false })
  })
})

describe("filters", () => {
  it("filters by bibliography, untriaged papers and papers no bibliography fits included", () => {
    const untriaged = papers.filter((p) => !p.triage.bib)
    const none = papers.filter((p) => p.triage.bib === "none")
    expect(ids(filterRows(rows(), { ...NO_FILTERS, bib: ["untriaged"] }))).toEqual(
      untriaged.map((p) => p.id)
    )
    expect(ids(filterRows(rows(), { ...NO_FILTERS, bib: ["none"] }))).toEqual(none.map((p) => p.id))
  })

  it("filters by kind and source", () => {
    const kind = papers.find((p) => p.triage.kind)!.triage.kind!
    expect(ids(filterRows(rows(), { ...NO_FILTERS, kind: [kind] }))).toEqual(
      papers.filter((p) => p.triage.kind === kind).map((p) => p.id)
    )
    const source = papers.find((p) => p.sources.length > 1)!.sources.at(-1)!
    expect(ids(filterRows(rows(), { ...NO_FILTERS, source: [source] }))).toEqual(
      papers.filter((p) => p.sources.includes(source)).map((p) => p.id)
    )
  })

  it("matches every word of the query, accents and case folded", () => {
    const accented = papers.find((p) => /[áéíóúñ]/.test(p.title))!
    const word = accented.title.split(/\s+/).find((w) => /[áéíóúñ]/.test(w))!
    const folded = word.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase()
    expect(matchesQuery(accented, folded)).toBe(true)
    expect(matchesQuery(accented, `${folded} zzzz`)).toBe(false)
    expect(matchesQuery(accented, "   ")).toBe(true)
  })

  it("counts each facet's values with the other filters applied", () => {
    const bib = worth[0]!.triage.bib!
    const f = { ...NO_FILTERS, bib: [bib] }
    const byBib = facetCounts(rows(), f, "bib")
    // Its own choice is ignored: every bibliography keeps its count.
    for (const p of papers) {
      const name = p.triage.bib || "untriaged"
      expect(byBib.get(name)).toBe(
        papers.filter((x) => (x.triage.bib || "untriaged") === name).length
      )
    }
    const byKind = facetCounts(rows(), f, "kind")
    const inBib = papers.filter((p) => p.triage.bib === bib)
    expect([...byKind.values()].reduce((a, b) => a + b, 0)).toBe(inBib.length)
  })

  it("lists facet values in a meaningful order, and keeps a chosen value", () => {
    const bibs = facetOptions(rows(), "bib")
    expect(bibs.slice(-2)).toEqual(["none", "untriaged"])
    expect(bibs.slice(0, -2)).toEqual([...bibs.slice(0, -2)].sort())
    expect(facetOptions([], "bib", ["gone"])).toEqual(["gone"])
    const kinds = facetOptions(rows(), "kind")
    expect(kinds.indexOf("primary")).toBeLessThan(kinds.indexOf("method"))
  })

  it("knows when a filter narrows the view", () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...NO_FILTERS, q: " x " })).toBe(true)
    expect(hasActiveFilters({ ...NO_FILTERS, q: "   " })).toBe(false)
    expect(hasActiveFilters({ ...NO_FILTERS, source: ["arxiv"] })).toBe(true)
  })
})

describe("sorting", () => {
  it("puts the most relevant first, then the closest to the library, unrated last", () => {
    const sorted = sortRows(rows(), "relevance").map((r) => r.paper)
    const rel = sorted.map((p) => p.triage.relevance ?? -1)
    expect(rel).toEqual([...rel].sort((a, b) => b - a))
    expect(sorted.at(-1)!.triage.relevance).toBeNull()
    for (let i = 1; i < sorted.length; i++) {
      const [a, b] = [sorted[i - 1]!, sorted[i]!]
      if (a.triage.relevance === b.triage.relevance && a.prior && b.prior)
        expect(a.prior.score).toBeGreaterThanOrEqual(b.prior.score)
    }
  })

  it("sorts by prior, the day found, the date and the title", () => {
    const byPrior = sortRows(rows(), "prior").map((r) => r.paper.prior?.score ?? -1)
    expect(byPrior).toEqual([...byPrior].sort((a, b) => b - a))
    const byDate = sortRows(rows(), "date").map((r) => r.paper.date)
    expect(byDate).toEqual([...byDate].sort().reverse())
    const titles = sortRows(rows(), "title").map((r) => r.paper.title)
    expect(titles).toEqual(
      [...titles].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    )
    const recent = [
      paper({ id: "old", found: "2026-11-01" }),
      paper({ id: "new", found: "2026-11-09T07:30:00" }),
    ]
    expect(
      ids(
        sortRows(
          recent.map((p) => ({ paper: p })),
          "found"
        )
      )
    ).toEqual(["new", "old"])
  })

  it("keeps the data's order on ties", () => {
    const tie = [paper({ id: "b" }), paper({ id: "a" })].map((p) => ({ paper: p }))
    expect(ids(sortRows(tie, "relevance"))).toEqual(["b", "a"])
  })
})

describe("groups", () => {
  const now = new Date(2026, 10, 10, 9, 0)

  it("follow the sort: relevance, the day found, the month published", () => {
    expect(
      groupOf(
        paper({ id: "x", triage: { ...paper({ id: "x" }).triage, relevance: 3 } }),
        "relevance"
      )
    ).toEqual({
      key: "rel-3",
      label: RELEVANCE[3].label,
    })
    expect(
      groupOf(
        paper({ id: "x", triage: { ...paper({ id: "x" }).triage, relevance: null } }),
        "relevance"
      )?.label
    ).toBe("Not rated")
    expect(groupOf(paper({ id: "x", found: "2026-11-10" }), "found", now)?.label).toBe("Today")
    expect(groupOf(paper({ id: "x", found: "2026-11-09T07:30:00" }), "found", now)?.label).toBe(
      "Yesterday"
    )
    expect(groupOf(paper({ id: "x", found: "2026-11-05" }), "found", now)?.label).toBe(
      formatShortDate("2026-11-05", now)
    )
    expect(groupOf(paper({ id: "x", date: "2026-10-28" }), "date")?.label).toBe("Oct 2026")
    expect(groupOf(paper({ id: "x", date: "2026" }), "date")?.label).toBe("2026")
    expect(groupOf(paper({ id: "x" }), "prior")).toBeNull()
    expect(groupOf(paper({ id: "x" }), "title")).toBeNull()
  })
})

describe("the list", () => {
  const opts = { day, filters: NO_FILTERS, sort: "relevance" as const }

  it("holds a view's papers in groups, with their counts", () => {
    const list = buildList(rows(), { ...opts, view: "worth" })
    expect(ids(list.shown)).toEqual(
      ids(
        sortRows(
          worth.map((p) => ({ paper: p })),
          "relevance"
        )
      )
    )
    for (const g of list.groups) {
      expect(g.count).toBe(g.rows.length)
      expect(new Set(g.rows.map((r) => r.row.paper.triage.relevance)).size).toBe(1)
    }
    expect(list.decided).toEqual([])
    const all = buildList(rows(), { ...opts, view: "waiting" })
    expect(all.shown).toHaveLength(waiting.length)
    const accepted = buildList(rows(), { ...opts, view: "accepted" })
    expect(ids(accepted.shown)).toEqual(
      papers.filter((p) => p.status === "accepted").map((p) => p.id)
    )
  })

  it("collapses a paper decided this session where it was and lists it as decided, latest first", () => {
    const [a, b] = worth
    const o = new Map<string, Override>([
      [a!.id, { status: "accepted", phase: "done", batch: 1 }],
      [b!.id, { status: "rejected", phase: "queued", batch: 2 }],
    ])
    const list = buildList(rows(o), { ...opts, view: "worth" })
    expect(ids(list.shown)).not.toContain(a!.id)
    expect(ids(list.decided)).toEqual([b!.id, a!.id])
    const collapsed = list.groups.flatMap((g) =>
      g.rows.filter((r) => r.collapsed).map((r) => r.row.paper.id)
    )
    expect(collapsed.sort()).toEqual([a!.id, b!.id].sort())
    expect(list.groups.reduce((n, g) => n + g.count, 0)).toBe(worth.length - 2)
    // In the Accepted view the accepted one is a row like any other.
    const accepted = buildList(rows(o), { ...opts, view: "accepted" })
    expect(ids(accepted.shown)).toContain(a!.id)
    expect(ids(accepted.decided)).toEqual([b!.id])
  })

  it("filters the decided papers too", () => {
    const [a] = worth
    const o = new Map<string, Override>([[a!.id, { status: "rejected", phase: "done", batch: 1 }]])
    const other = papers.find((p) => p.triage.bib && p.triage.bib !== a!.triage.bib)!.triage.bib!
    const list = buildList(rows(o), {
      ...opts,
      view: "worth",
      filters: { ...NO_FILTERS, bib: [other] },
    })
    expect(list.decided).toEqual([])
  })

  it("shows a paper a link names that is in neither", () => {
    const rejected = papers.find((p) => p.status === "rejected")!
    const list = buildList(rows(), { ...opts, view: "worth", linked: rejected.id })
    expect(list.linked?.paper.id).toBe(rejected.id)
    expect(linkedLabel(list.linked!.status)).toBe("Rejected")
    expect(buildList(rows(), { ...opts, view: "worth", linked: worth[0]!.id }).linked).toBeNull()
  })

  it("finds the view a paper is in, and the next view", () => {
    const accepted = papers.find((p) => p.status === "accepted")!
    expect(viewOf(accepted, accepted.status, day)).toBe("accepted")
    expect(viewOf(worth[0]!, "new", day)).toBe("worth")
    expect(viewOf(worth[0]!, "rejected", day)).toBeNull()
    expect(nextView("new")).toBe("worth")
    expect(nextView("accepted")).toBe("new")
  })
})

describe("queries", () => {
  const [first, second] = lib.bibliographies.filter((b) => b.articles.length > 1)
  const [k1, k2] = first!.articles.map((a) => a.key)

  it("reads the keys a citing paper's query names", () => {
    expect(citedKeys(`cites ${k1}, ${k2}`)).toEqual({ keys: [k1, k2], more: false })
    expect(citedKeys("cites a, b, c, d, e, f …")).toEqual({
      keys: ["a", "b", "c", "d", "e", "f"],
      more: true,
    })
    expect(citedKeys("cites a, b...")).toEqual({ keys: ["a", "b"], more: true })
    expect(citedKeys("cites")).toBeNull()
    expect(citedKeys(papers[0]!.queries[0]!)).toBeNull()
  })

  it("reads the bibliography an entry names: '<bib>: <query>'", () => {
    expect(parseQuery(`${first!.name}: cites ${k1}, ${k2} …`, bibNames)).toEqual({
      bib: first!.name,
      text: `cites ${k1}, ${k2} …`,
      cites: { keys: [k1, k2], more: true },
    })
    const q = papers[0]!.queries[0]!
    expect(parseQuery(`${first!.name}: ${q}`, bibNames)).toEqual({
      bib: first!.name,
      text: q,
      cites: null,
    })
    // A prefix that names no bibliography is part of the query.
    expect(parseQuery("Signals: a review", bibNames)).toEqual({
      bib: null,
      text: "Signals: a review",
      cites: null,
    })
    expect(parseQuery(q)).toEqual({ bib: null, text: q, cites: null })
    // Without the bibliographies, a lower-case name counts.
    expect(parseQuery(`${first!.name}: ${q}`).bib).toBe(first!.name)
  })

  it("gathers the articles a paper cites across its queries, each once", () => {
    const k3 = second!.articles[0]!.key
    const got = citesOf(
      [
        `${first!.name}: cites ${k1}, ${k2}`,
        `${second!.name}: cites ${k3}, ${k1} …`,
        "a plain query",
      ],
      bibNames
    )
    expect(got).toEqual({
      refs: [
        { bib: first!.name, key: k1 },
        { bib: first!.name, key: k2 },
        { bib: second!.name, key: k3 },
      ],
      more: true,
    })
    expect(citesOf(["a plain query"])).toEqual({ refs: [], more: false })
  })
})

describe("the daily run", () => {
  const now = new Date(2026, 10, 10, 9, 0)
  it("says when it last ran, by its own clock", () => {
    expect(ranWords("2026-11-10T07:36:02", now)).toBe("today at 07:36")
    expect(ranWords("2026-11-09T07:30:12", now)).toBe("yesterday at 07:30")
    expect(ranWords("2026-11-05T07:30:12", now)).toBe(
      `on ${formatShortDate("2026-11-05", now)} at 07:30`
    )
    expect(ranWords("2026-11-05", now)).toBe(`on ${formatShortDate("2026-11-05", now)}`)
    expect(ranWords("", now)).toBeNull()
  })
})

describe("the hook", () => {
  it("is the first clause with a result, else a measure, else a figure", () => {
    expect(
      hookOf("An invented model on two arrays; error falls to 12.5% online, from 30% offline.")
    ).toBe("error falls to 12.5% online")
    expect(hookOf("Un modelo inventado; precisión de 74,4 % en cinco clases.")).toBe(
      "precisión de 74,4 % en cinco clases"
    )
    expect(hookOf("A transformer for invented signals; claims a 2× speed-up.")).toBe(
      "claims a 2× speed-up"
    )
    expect(hookOf("Recorded with 96 sensors in S12 since 2021.")).toBe(
      "Recorded with 96 sensors in S12 since 2021"
    )
    // Identifiers and years are no figures; a summary without one has no hook.
    expect(hookOf("ResNet50 on the T15 dataset, released in 2024.")).toBeNull()
    expect(hookOf(null)).toBeNull()
  })

  it("keeps parentheses whole and cuts a long clause around its figure", () => {
    expect(hookOf("Two arrays (left, right) with gains of 3.2 dB, then a review.")).toBe(
      "Two arrays (left, right) with gains of 3.2 dB"
    )
    const long = `${"word ".repeat(30)}reaches 91.5% accuracy ${"after more words ".repeat(10)}`
    const hook = hookOf(long)!
    expect(hook).toContain("91.5%")
    expect(hook.startsWith("…")).toBe(true)
    expect(hook.endsWith("…")).toBe(true)
    expect(hook.length).toBeLessThan(120)
  })

  it("reads the fixture's summaries", () => {
    for (const p of papers) {
      const hook = hookOf(p.triage.summary)
      if (hook) expect(p.triage.summary).toContain(hook.replace(/^…|…$/g, ""))
    }
  })

  it("says how long ago a paper was found", () => {
    const now = new Date(2026, 10, 10, 9, 0)
    expect(foundAgo("2026-11-10", now)).toBe("found today")
    expect(foundAgo("2026-11-08T07:30:00", now)).toBe("found 2 d")
    expect(foundAgo("2026-10-20", now)).toBe("found 3 wk")
    expect(foundAgo("2026-08-02", now)).toBe(`found ${formatShortDate("2026-08-02", now)}`)
    expect(foundAgo("", now)).toBeNull()
  })
})
