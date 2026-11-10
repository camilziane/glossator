import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { fixtureJson } from "../../../tests/utils/fixture"

import { LibraryError, parseLibrary } from "./library"
import {
  ArticleViewSchema,
  BLOCK_KINDS,
  LibrarySchema,
  MARK_KINDS,
  isSeriousNotice,
  readArticleView,
} from "./schema"

// The real library of this checkout, read where `glossator build` writes it (never copied into web/).
const REAL_DATA = resolve(__dirname, "../../../../build/data/library.json")
// The tool's own source: the words it writes into every library (a footer, labels) are not private.
const TOOL_SOURCE = resolve(__dirname, "../../../../src/glossator")
const FIXTURES = resolve(__dirname, "../../../tests/fixtures")

function kindsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => kindsIn(v, out))
  else if (value && typeof value === "object") {
    const t = (value as { t?: unknown }).t
    if (typeof t === "string") out.add(t)
    Object.values(value).forEach((v) => kindsIn(v, out))
  }
  return out
}

describe("the fixture", () => {
  it("follows the schema, every article's page included", () => {
    const result = LibrarySchema.safeParse(fixtureJson)
    expect(result.success, result.error?.message).toBe(true)
    const lib = parseLibrary(fixtureJson)
    expect(lib.problems).toEqual([])
    for (const { article } of lib.articles)
      if (article.view !== undefined)
        expect(ArticleViewSchema.safeParse(article.view).success, article.key).toBe(true)
  })

  it("uses every block and inline kind", () => {
    const kinds = kindsIn(fixtureJson)
    for (const k of [...BLOCK_KINDS, ...MARK_KINDS, "a", "art"]) expect(kinds, k).toContain(k)
  })

  it("covers the edge cases the app must draw", () => {
    const lib = parseLibrary(fixtureJson)
    const articles = lib.articles.map((e) => e.article)
    expect(articles.some((a) => a.error && !a.view)).toBe(true)
    expect(articles.some((a) => readArticleView(a).view?.draft)).toBe(true)
    expect(articles.some((a) => a.notices.some(isSeriousNotice))).toBe(true)
    expect(articles.some((a) => a.notices.some((n) => !isSeriousNotice(n)))).toBe(true)
    expect(lib.bibliographies.some((b) => b.articles.length === 0)).toBe(true)
    const papers = lib.inbox?.papers ?? []
    expect(new Set(papers.map((p) => p.status))).toEqual(
      new Set(["new", "accepted", "rejected", "added"])
    )
    expect(new Set(papers.map((p) => p.triage.relevance))).toEqual(new Set([null, 0, 1, 2, 3]))
    expect(papers.some((p) => p.prior === null)).toBe(true)
    expect(papers.some((p) => p.triage.by === "prior")).toBe(true)
  })
})

/** Every string of a JSON value (keys included), cut at sentence ends. */
function sentences(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(...value.split(/(?<=[.!?;:])\s+/))
  else if (Array.isArray(value)) value.forEach((v) => sentences(v, out))
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      out.push(k)
      sentences(v, out)
    }
  return out
}

const RUN = 24

describe.runIf(existsSync(REAL_DATA))("the real library of this checkout", () => {
  it("lends nothing to the fixtures: no run of 24 characters in common", () => {
    // Every run of RUN characters of the fixtures, then every run of the real data looked up in it:
    // the real text is only read here, never printed beyond the run a fixture already holds.
    const runs = new Map<string, string>()
    for (const file of readdirSync(FIXTURES)) {
      const text = readFileSync(join(FIXTURES, file), "utf8")
      const parts = file.endsWith(".json") ? sentences(JSON.parse(text)) : text.split(/\n/)
      for (const s of parts)
        for (let i = 0; i + RUN <= s.length; i++) runs.set(s.slice(i, i + RUN), file)
    }
    const tool = existsSync(TOOL_SOURCE)
      ? readdirSync(TOOL_SOURCE, { recursive: true })
          .map(String)
          .filter((f) => f.endsWith(".py"))
          .map((f) => readFileSync(join(TOOL_SOURCE, f), "utf8"))
          .join("\n")
      : ""
    const shared = new Set<string>()
    const real: unknown = JSON.parse(readFileSync(REAL_DATA, "utf8"))
    for (const s of sentences(real))
      for (let i = 0; i + RUN <= s.length; i++) {
        const run = s.slice(i, i + RUN)
        if (runs.has(run) && !tool.includes(run)) shared.add(`${runs.get(run)}: “${run}”`)
      }
    expect([...shared], "invent these instead of copying them").toEqual([])
  })

  it("follows the schema, every article's page included", () => {
    const json: unknown = JSON.parse(readFileSync(REAL_DATA, "utf8"))
    const result = LibrarySchema.safeParse(json)
    expect(
      result.success,
      result.error
        ? result.error.issues
            .slice(0, 5)
            .map((i) => i.path.join(".") + ": " + i.message)
            .join("\n")
        : ""
    ).toBe(true)
    const lib = parseLibrary(json)
    expect(lib.problems.map((p) => `${p.kind} ${p.ref}`)).toEqual([])
    const unreadable = lib.articles
      .filter((e) => e.article.view !== undefined && readArticleView(e.article).view === null)
      .map((e) => e.ref)
    expect(unreadable).toEqual([])
  })
})

describe("format evolution", () => {
  const base = () =>
    structuredClone(fixtureJson) as Record<string, unknown> & {
      bibliographies: { articles: Record<string, unknown>[] }[]
      inbox: { papers: Record<string, unknown>[] }
    }

  it("reads data written before notices, prior and triage.by", () => {
    const json = base()
    for (const bib of json.bibliographies) for (const a of bib.articles) delete a.notices
    for (const p of json.inbox.papers) {
      delete p.prior
      delete (p.triage as Record<string, unknown>).by
    }
    const lib = parseLibrary(json)
    expect(lib.articles[0]?.article.notices).toEqual([])
    expect(lib.inbox?.papers[0]?.prior).toBeNull()
    expect(lib.inbox?.papers[0]?.triage.by).toBeNull()
  })

  it("skips an unknown block and reads an unknown inline part as its text", () => {
    const json = base()
    const view = json.bibliographies[0]!.articles[0]!.view as {
      lead: unknown[]
      sections: { blocks: unknown[] }[]
    }
    view.lead = ["a ", { t: "sparkle", text: "new" }, " part"]
    view.sections[0]!.blocks.unshift({ t: "carousel", items: [] })
    const lib = parseLibrary(json)
    const parsed = readArticleView(lib.articles[0]!.article).view!
    expect(parsed.lead).toEqual(["a ", "new", " part"])
    expect(parsed.sections[0]!.blocks[0]?.t).toBe("p")
  })

  it("refuses another version, and a library without its frame, with a LibraryError", () => {
    expect(() => parseLibrary({ ...base(), version: 2 })).toThrow(LibraryError)
    try {
      parseLibrary({ ...base(), version: 2 })
    } catch (e) {
      expect((e as LibraryError).kind).toBe("version")
    }
    try {
      parseLibrary({ ...base(), bibliographies: "none" })
      expect.unreachable()
    } catch (e) {
      expect((e as LibraryError).kind).toBe("invalid")
      expect((e as LibraryError).detail).toContain("bibliographies")
    }
  })

  it("reads null texts as empty and clamps scores out of their range", () => {
    const json = base()
    const article = json.bibliographies[0]!.articles[0]!
    article.venue = null
    article.tags = null
    const paper = json.inbox.papers[0]!
    paper.abstract = null
    paper.authors = null
    paper.prior = { bib: "ml", score: 1.4, by: "model" }
    ;(paper.triage as Record<string, unknown>).relevance = 5
    const lib = parseLibrary(json)
    expect(lib.problems).toEqual([])
    expect(lib.articles[0]!.article.venue).toBe("")
    expect(lib.articles[0]!.article.tags).toEqual([])
    const read = lib.inbox!.papers[0]!
    expect(read.abstract).toBe("")
    expect(read.authors).toEqual([])
    expect(read.prior?.score).toBe(1)
    expect(read.triage.relevance).toBe(3)
  })

  it("leaves out an article or a paper that does not follow the format, and says which", () => {
    const json = base()
    const bib = json.bibliographies[0] as unknown as { name: string }
    const article = json.bibliographies[0]!.articles[1]!
    article.year = { not: "a year" }
    const paper = json.inbox.papers[1]!
    paper.status = "maybe"
    const lib = parseLibrary(json)
    expect(lib.articles.some((e) => e.article.key === article.key)).toBe(false)
    expect(lib.inboxPaper(String(paper.id))).toBeUndefined()
    expect(lib.problems.map((p) => [p.kind, p.ref])).toEqual([
      ["article", `${bib.name}/${String(article.key)}`],
      ["inbox paper", String(paper.id)],
    ])
    expect(lib.problems[0]!.detail).toContain("year")
    // Everything else is read.
    expect(lib.articles.length).toBe(parseLibrary(base()).articles.length - 1)
  })

  it("checks an article's page when it is first read: a bad one is that article's error", () => {
    const json = base()
    const view = json.bibliographies[0]!.articles[0]!.view as { sections: unknown }
    view.sections = "not a list"
    const lib = parseLibrary(json)
    expect(lib.problems).toEqual([])
    const read = readArticleView(lib.articles[0]!.article)
    expect(read.view).toBeNull()
    expect(read.error).toMatch(/does not follow the format.*sections/)
    // Remembered: the same answer, not a second validation.
    expect(readArticleView(lib.articles[0]!.article)).toBe(read)
  })
})
