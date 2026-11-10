import { describe, expect, it } from "vitest"

import {
  indexLibrary,
  type Article,
  type Bibliography,
  type InboxPaper,
  type Library,
} from "@/lib/data"
import { countInboxViews } from "@/lib/inbox-views"

import { fixtureLibrary } from "../../../tests/utils/fixture"

import {
  contentsEntry,
  inboxDigest,
  libraryDigest,
  recentArticles,
  runWhen,
  sentenceNumber,
  todaySentence,
  yearSpan,
  type SentencePart,
} from "./today-data"

function bibOf(name: string, data: Library = fixtureLibrary()): Bibliography {
  const bib = data.bibliographies.find((b) => b.name === name)
  if (!bib) throw new Error(`no ${name} in the fixture`)
  return bib
}

function article(over: Partial<Article> & { key: string }): Article {
  return {
    cite: over.key,
    title: over.key,
    authors: "",
    year: 2020,
    venue: "",
    doi: "",
    status: "complete",
    tags: [],
    one_line: "",
    notices: [],
    ...over,
  }
}

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
    found: "2026-01-01",
    sources: [],
    queries: [],
    triage: { bib: null, relevance: null, kind: null, summary: null, why: null, by: null },
    prior: null,
    ...over,
  }
}

/** The sentence as text, its links as [words](href). */
function text(parts: readonly SentencePart[]): string {
  return parts
    .map((p) => (typeof p === "string" ? p : `[${p.figure} ${p.words}](${p.href})`))
    .join("")
}

/** The fixture's inbox with its latest run on the day its papers were found (they are all new). */
function runOnFoundDay(data: Library = fixtureLibrary()): Library {
  const day = data.inbox!.papers[0]!.found
  data.inbox!.last_run = `${day}T07:30:12`
  return data
}

describe("contentsEntry", () => {
  it("counts articles, drafts, unreadable records, years and notices", () => {
    const bib = bibOf("grassland")
    const entry = contentsEntry(bib)
    const years = bib.articles.flatMap((a) => (a.year === null ? [] : [a.year]))
    expect(entry).toMatchObject({
      total: bib.articles.length,
      drafts: bib.articles.length - bib.complete,
      unreadable: bib.articles.filter((a) => a.error !== undefined).length,
      years: { from: Math.min(...years), to: Math.max(...years) },
    })
    const retracted = bib.articles.find((a) => a.notices.some((n) => n.type === "retraction"))!
    const corrected = bib.articles.find((a) => a.notices.some((n) => n.type === "correction"))!
    expect(entry.notices).toEqual([
      {
        label: "retracted",
        count: 1,
        serious: true,
        only: { key: retracted.key, cite: retracted.cite },
      },
      {
        label: "corrected",
        count: 1,
        serious: false,
        only: { key: corrected.key, cite: corrected.cite },
      },
    ])
  })

  it("counts an article once, under its gravest notice, and names it only when alone", () => {
    const retraction = { type: "retraction", label: "", doi: "", date: "", title: "" }
    const correction = { type: "correction", label: "", doi: "", date: "", title: "" }
    const bib: Bibliography = {
      ...bibOf("ml"),
      complete: 3,
      articles: [
        article({ key: "a", notices: [correction, retraction] }),
        article({ key: "b", notices: [retraction] }),
        article({ key: "c", notices: [correction], year: null }),
      ],
    }
    expect(contentsEntry(bib).notices).toEqual([
      { label: "retracted", count: 2, serious: true, only: null },
      { label: "corrected", count: 1, serious: false, only: { key: "c", cite: "c" } },
    ])
  })

  it("has no years and no notices without articles", () => {
    const entry = contentsEntry({ ...bibOf("ml"), complete: 0, articles: [] })
    expect(entry).toMatchObject({ total: 0, drafts: 0, years: null, notices: [] })
  })
})

describe("yearSpan", () => {
  it("writes a range with an en dash, a single year alone", () => {
    expect(yearSpan({ from: 2009, to: 2026 })).toBe("2009–2026")
    expect(yearSpan({ from: 2024, to: 2024 })).toBe("2024")
    expect(yearSpan(null)).toBeNull()
  })
})

describe("recentArticles", () => {
  it("groups the newest articles by year, alternating bibliographies within a year", () => {
    const lib = indexLibrary(fixtureLibrary())
    const groups = recentArticles(lib, 3)
    expect(groups.flatMap((g) => g.entries)).toHaveLength(3)
    const years = groups.map((g) => g.year)
    expect(years).toEqual([...years].sort((a, b) => (b ?? 0) - (a ?? 0)))
    const first = groups[0]!
    expect(new Set(first.entries.map((e) => e.bib.name)).size).toBe(first.entries.length)
  })

  it("puts the articles without a year last", () => {
    const data = fixtureLibrary()
    data.bibliographies[0]!.articles[0]!.year = null
    const groups = recentArticles(indexLibrary(data), 100)
    expect(groups.at(-1)!.year).toBeNull()
  })
})

describe("libraryDigest", () => {
  it("is computed once per library", () => {
    const lib = indexLibrary(fixtureLibrary())
    const digest = libraryDigest(lib)
    expect(libraryDigest(lib)).toBe(digest)
    expect(digest.contents.map((e) => e.bib.name)).toEqual(lib.bibliographies.map((b) => b.name))
    expect(digest.articles).toBe(lib.bibliographies.reduce((n, b) => n + b.articles.length, 0))
  })
})

describe("inboxDigest", () => {
  it("lists the latest run's best papers when it brought undecided ones", () => {
    const inbox = runOnFoundDay().inbox!
    const counts = countInboxViews(inbox)
    const digest = inboxDigest(inbox, counts)
    expect(digest.view).toBe("new")
    expect(digest.inView).toBe(counts.new)
    expect(digest.papers).toHaveLength(Math.min(5, counts.new))
    const relevances = digest.papers.map((p) => p.triage.relevance ?? -1)
    expect(relevances).toEqual([...relevances].sort((a, b) => b - a))
  })

  it("falls back to the papers worth a look, then to every waiting paper", () => {
    const inbox = fixtureLibrary().inbox!
    inbox.last_run = "2099-01-01T07:00:00"
    const counts = countInboxViews(inbox)
    expect(counts.new).toBe(0)
    const worth = inboxDigest(inbox, counts)
    expect(worth.view).toBe("worth")
    expect(worth.papers.every((p) => (p.triage.relevance ?? 0) >= 2)).toBe(true)
    // Priors break ties within a relevance.
    const scores = worth.papers.filter((p) => p.triage.relevance === 2).map((p) => p.prior!.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))

    inbox.papers = [paper({ id: "x", found: "2026-01-01" }), paper({ id: "y", status: "accepted" })]
    const waiting = inboxDigest(inbox, countInboxViews(inbox))
    expect(waiting).toMatchObject({ view: "waiting", inView: 1 })
    expect(waiting.papers.map((p) => p.id)).toEqual(["x"])
  })

  it("counts the session's decisions, and has nothing when nothing waits", () => {
    const inbox = runOnFoundDay().inbox!
    const best = inboxDigest(inbox, countInboxViews(inbox)).papers[0]!
    const status = (p: InboxPaper) => (p.id === best.id ? "rejected" : p.status)
    expect(
      inboxDigest(inbox, countInboxViews(inbox, status), status).papers.map((p) => p.id)
    ).not.toContain(best.id)

    inbox.papers = inbox.papers.filter((p) => p.status !== "new")
    expect(inboxDigest(inbox, countInboxViews(inbox))).toEqual({
      view: null,
      papers: [],
      inView: 0,
    })
    expect(inboxDigest(null, countInboxViews(null)).view).toBeNull()
  })
})

describe("runWhen", () => {
  const now = new Date(2026, 10, 10, 9, 0)
  it("says when the latest run was, in words", () => {
    expect(runWhen("2026-11-10T07:30:00", "2026-11-10", now)).toBe("This morning")
    expect(runWhen("2026-11-10T13:05:00", "2026-11-10", now)).toBe("This afternoon")
    expect(runWhen("2026-11-10T21:00:00", "2026-11-10", now)).toBe("This evening")
    expect(runWhen("", "2026-11-10", now)).toBe("Today")
    expect(runWhen("2026-11-09T07:30:00", "2026-11-09", now)).toBe("Yesterday")
    expect(runWhen("2026-11-05T07:30:00", "2026-11-05", now)).toBe("On 5 Nov")
    expect(runWhen("2025-11-05T07:30:00", "2025-11-05", now)).toBe("On 5 Nov 2025")
  })
})

describe("sentenceNumber", () => {
  it("writes small counts in words to open a sentence", () => {
    expect(sentenceNumber(1)).toBe("One")
    expect(sentenceNumber(4)).toBe("Four")
    expect(sentenceNumber(20)).toBe("Twenty")
    expect(sentenceNumber(1234)).toBe("1,234")
  })
})

describe("todaySentence", () => {
  const sentence = (data: Library, now: Date) => {
    const lib = indexLibrary(data)
    const digest = libraryDigest(lib)
    return text(
      todaySentence({
        bibliographies: digest.contents.length,
        articles: digest.articles,
        inbox: lib.inbox,
        counts: countInboxViews(lib.inbox),
        now,
      })
    )
  }

  it("says what the library holds and what the latest run found", () => {
    const data = runOnFoundDay()
    const day = data.inbox!.papers[0]!.found
    const morning = new Date(`${day}T09:00:00`)
    const counts = countInboxViews(data.inbox)
    const bibs = data.bibliographies.length
    const articles = data.bibliographies.reduce((n, b) => n + b.articles.length, 0)
    expect(counts.waiting).toBe(counts.new)
    expect(sentence(data, morning)).toBe(
      `${sentenceNumber(bibs)} bibliographies, ${articles} articles. ` +
        `This morning the inbox found [${counts.new} new papers](/inbox/?view=new), ` +
        `[${counts.inScope} of them in scope](/inbox/?view=worth). ` +
        `[${sentenceNumber(counts.accepted)} accepted paper waits](/inbox/?view=accepted) to be added.`
    )
  })

  it("says how many wait beside the new ones, and when none is in scope", () => {
    const data = runOnFoundDay()
    const day = data.inbox!.papers[0]!.found
    const older = data.inbox!.papers.find((p) => p.status === "new" && p.triage.relevance !== 3)!
    older.found = "2020-01-01"
    for (const p of data.inbox!.papers) if (p.triage.relevance === 3) p.triage.relevance = 1
    const counts = countInboxViews(data.inbox)
    expect(sentence(data, new Date(`${day}T20:00:00`))).toContain(
      `found [${counts.new} new papers](/inbox/?view=new); ${counts.waiting} wait, none in scope.`
    )
  })

  it("speaks of one paper in the singular", () => {
    const data = runOnFoundDay()
    const day = data.inbox!.papers[0]!.found
    data.inbox!.papers = data.inbox!.papers.filter((p) => p.status !== "new").slice(0, 0)
    data.inbox!.papers.push(
      paper({ id: "solo", found: day, triage: { ...paper({ id: "t" }).triage, relevance: 3 } })
    )
    expect(sentence(data, new Date(`${day}T09:00:00`))).toContain(
      "found [1 new paper](/inbox/?view=new), [1 of them in scope](/inbox/?view=worth)."
    )
  })

  it("says when the latest run found nothing new, and what waits", () => {
    const data = fixtureLibrary()
    const counts = countInboxViews(data.inbox)
    const runDay = data.inbox!.last_run.slice(0, 10)
    const nextDay = new Date(`${runDay}T13:00:00`)
    nextDay.setDate(nextDay.getDate() + 1)
    expect(counts.new).toBe(0)
    expect(sentence(data, nextDay)).toContain(
      `Yesterday the inbox found nothing new; [${counts.waiting} papers wait](/inbox/?view=waiting), ` +
        `[${counts.inScope} of them in scope](/inbox/?view=worth).`
    )

    data.inbox!.papers = data.inbox!.papers.filter(
      (p) => p.status !== "new" && p.status !== "accepted"
    )
    expect(sentence(data, nextDay)).toContain(
      "Yesterday the inbox found nothing new, and nothing waits for a decision."
    )
  })

  it("says when the inbox never ran, and when there is no inbox or no bibliography", () => {
    const data = fixtureLibrary()
    data.inbox = { last_run: "", papers: [] }
    expect(sentence(data, new Date())).toMatch(/\. The inbox has not run yet\.$/)

    data.inbox = null
    data.bibliographies = data.bibliographies.slice(0, 1)
    const bib = data.bibliographies[0]!
    expect(sentence(data, new Date())).toBe(`One bibliography, ${bib.articles.length} articles.`)

    bib.articles = []
    expect(sentence(data, new Date())).toBe("One bibliography, no article yet.")

    data.bibliographies = []
    expect(sentence(data, new Date())).toBe("No bibliography yet.")
  })
})
