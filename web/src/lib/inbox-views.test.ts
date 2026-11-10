import { describe, expect, it } from "vitest"

import type { InboxPaper, InboxStatus } from "@/lib/data"

import {
  countInboxViews,
  defaultInboxView,
  inView,
  latestRunDay,
  papersInView,
  resolveInboxView,
} from "./inbox-views"

function paper(
  id: string,
  over: { status?: InboxStatus; found?: string; relevance?: number | null } = {}
): InboxPaper {
  return {
    id,
    title: `Invented paper ${id}`,
    authors: [],
    venue: "",
    date: "",
    doi: "",
    url: "",
    pdf: "",
    pdf_online: "",
    abstract: "",
    status: over.status ?? "new",
    found: over.found ?? "2026-11-10",
    sources: [],
    queries: [],
    triage: {
      bib: null,
      relevance: over.relevance === undefined ? 1 : over.relevance,
      kind: null,
      summary: null,
      why: null,
      by: null,
    },
    prior: null,
  }
}

const inbox = {
  last_run: "2026-11-10T07:36:34",
  papers: [
    paper("a", { relevance: 3 }),
    paper("b", { relevance: 2 }),
    paper("c", { relevance: 0 }),
    paper("d", { relevance: null }),
    paper("e", { found: "2026-11-09", relevance: 3 }),
    paper("f", { found: "2026-11-05", relevance: 1 }),
    paper("g", { status: "accepted", relevance: 3 }),
    paper("h", { status: "rejected", relevance: 3 }),
    paper("i", { status: "added", relevance: 2 }),
  ],
}

describe("latestRunDay", () => {
  it("is the date of the last run", () => {
    expect(latestRunDay(inbox)).toBe("2026-11-10")
    expect(latestRunDay({ ...inbox, last_run: "2026-11-10T00:30:00+01:00" })).toBe("2026-11-10")
  })

  it("falls back to the latest day a paper was found when the run date is missing", () => {
    expect(latestRunDay({ ...inbox, last_run: "" })).toBe("2026-11-10")
    expect(latestRunDay({ last_run: "never", papers: [paper("x", { found: "2026-10-01" })] })).toBe(
      "2026-10-01"
    )
  })

  it("is null without a run and without papers", () => {
    expect(latestRunDay({ last_run: "", papers: [] })).toBeNull()
    expect(latestRunDay(null)).toBeNull()
  })
})

describe("the inbox's views", () => {
  it("New holds the undecided papers found on the day of the last run", () => {
    expect(papersInView(inbox, "new").map((p) => p.id)).toEqual(["a", "b", "c", "d"])
    expect(inView("new", paper("z"), "new", null)).toBe(false)
  })

  it("Worth a look holds the undecided papers rated 2 or 3, whenever found", () => {
    expect(papersInView(inbox, "worth").map((p) => p.id)).toEqual(["a", "b", "e"])
  })

  it("All waiting holds every undecided paper; Accepted the accepted ones", () => {
    expect(papersInView(inbox, "waiting").map((p) => p.id)).toEqual(["a", "b", "c", "d", "e", "f"])
    expect(papersInView(inbox, "accepted").map((p) => p.id)).toEqual(["g"])
  })

  it("counts each view, and the papers in scope", () => {
    expect(countInboxViews(inbox)).toEqual({
      new: 4,
      worth: 3,
      waiting: 6,
      accepted: 1,
      inScope: 2,
    })
    expect(countInboxViews(null)).toEqual({ new: 0, worth: 0, waiting: 0, accepted: 0, inScope: 0 })
  })

  it("counts with this session's decisions", () => {
    const decided: Record<string, InboxStatus> = { a: "rejected", b: "accepted" }
    const counts = countInboxViews(inbox, (p) => decided[p.id] ?? p.status)
    expect(counts).toEqual({ new: 2, worth: 1, waiting: 4, accepted: 2, inScope: 1 })
  })

  it("opens on New while it has papers, else on Worth a look", () => {
    expect(defaultInboxView({ new: 4 })).toBe("new")
    expect(defaultInboxView({ new: 0 })).toBe("worth")
    expect(resolveInboxView("accepted", { new: 4 })).toBe("accepted")
    expect(resolveInboxView("bogus", { new: 0 })).toBe("worth")
    expect(resolveInboxView(null, { new: 2 })).toBe("new")
  })
})
