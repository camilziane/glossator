import { describe, expect, it } from "vitest"

import type { InboxPaper } from "./data"
import { compareInboxPapers } from "./inbox-order"

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

describe("compareInboxPapers", () => {
  it("puts untriaged papers last, then sorts by prior", () => {
    const untriaged = paper({ id: "u", prior: { bib: "x", score: 0.99, by: "model" } })
    const low = paper({
      id: "l",
      triage: { bib: "x", relevance: 0, kind: null, summary: null, why: null, by: "prior" },
    })
    const close = paper({
      id: "c",
      triage: { bib: "x", relevance: 1, kind: null, summary: null, why: null, by: "haiku" },
      prior: { bib: "x", score: 0.7, by: "similarity" },
    })
    const far = paper({
      id: "f",
      triage: { bib: "x", relevance: 1, kind: null, summary: null, why: null, by: "haiku" },
      prior: { bib: "x", score: 0.2, by: "similarity" },
    })
    expect([untriaged, far, low, close].sort(compareInboxPapers).map((p) => p.id)).toEqual([
      "c",
      "f",
      "l",
      "u",
    ])
  })

  it("then puts the most recently found first, then the newest published", () => {
    const triage: InboxPaper["triage"] = {
      bib: "x",
      relevance: 2,
      kind: null,
      summary: null,
      why: null,
      by: "haiku",
    }
    const old = paper({ id: "old", triage, found: "2026-01-01", date: "2025-05-01" })
    const recent = paper({ id: "recent", triage, found: "2026-02-01", date: "2024-01-01" })
    const newer = paper({ id: "newer", triage, found: "2026-01-01", date: "2025-09-01" })
    expect([old, recent, newer].sort(compareInboxPapers).map((p) => p.id)).toEqual([
      "recent",
      "newer",
      "old",
    ])
  })
})
