import { describe, expect, it } from "vitest"

import {
  entryKey,
  fromHere,
  legacyHashTarget,
  listKey,
  normalizePath,
  parseFrom,
  routes,
} from "./routes"

describe("routes", () => {
  it("builds every route with a trailing slash and encoded params", () => {
    expect(routes.overview()).toBe("/")
    expect(routes.bib("grassland")).toBe("/bib/?b=grassland")
    expect(routes.bib("ml", "kinds")).toBe("/bib/?b=ml#kinds")
    expect(routes.article("ml", "novak2024")).toBe("/article/?b=ml&k=novak2024")
    expect(routes.article("ml", "a&b", "open-points")).toBe("/article/?b=ml&k=a%26b#open-points")
    expect(routes.search()).toBe("/search/")
    expect(routes.search({ q: "  probe array " })).toBe("/search/?q=probe+array")
    expect(routes.search({ q: "x", scope: "all", mode: "hybrid" })).toBe("/search/?q=x")
    expect(routes.search({ q: "x", bib: "ml", scope: "text", mode: "keyword" })).toBe(
      "/search/?q=x&bib=ml&scope=text&mode=keyword"
    )
    expect(routes.inbox()).toBe("/inbox/")
  })

  it("links one inbox paper, with its status when the inbox hides it by default", () => {
    expect(routes.inbox("W123")).toBe("/inbox/?p=W123")
    expect(routes.inbox("doi:10.1/x y", "new")).toBe("/inbox/?p=doi%3A10.1%2Fx+y")
    expect(routes.inbox("W123", "accepted")).toBe("/inbox/?p=W123")
    expect(routes.inbox("W123", "rejected")).toBe("/inbox/?p=W123&status=rejected")
    expect(routes.inbox("W123", "added")).toBe("/inbox/?p=W123&status=added")
    expect(routes.inbox(undefined, "rejected")).toBe("/inbox/")
  })

  it("links an inbox view, with or without a paper", () => {
    expect(routes.inbox({ view: "new" })).toBe("/inbox/?view=new")
    expect(routes.inbox({ view: "worth", paper: "W1" })).toBe("/inbox/?view=worth&p=W1")
    expect(routes.inbox({ paper: "W1", status: "rejected" })).toBe("/inbox/?p=W1&status=rejected")
    expect(routes.inbox({ view: null })).toBe("/inbox/")
  })

  it("carries the list an article is opened from", () => {
    const from = fromHere("/bib/", "b=ml&sort=year.asc")
    expect(from).toBe("/bib/?b=ml&sort=year.asc")
    expect(routes.article("ml", "novak2024", undefined, { from })).toBe(
      "/article/?b=ml&k=novak2024&from=%2Fbib%2F%3Fb%3Dml%26sort%3Dyear.asc"
    )
    expect(routes.article("ml", "novak2024", "results", { from: null })).toBe(
      "/article/?b=ml&k=novak2024#results"
    )
  })
})

describe("pages and lists", () => {
  const p = (s: string) => new URLSearchParams(s)

  it("normalizes a path", () => {
    expect(normalizePath("/bib/")).toBe("/bib")
    expect(normalizePath("/bib")).toBe("/bib")
    expect(normalizePath("/")).toBe("/")
  })

  it("names a page by its route and the params that say what it shows", () => {
    expect(entryKey("/", p(""))).toBe("/")
    expect(entryKey("/bib/", p("b=ml&q=x&sort=year.asc"))).toBe("/bib?b=ml")
    expect(entryKey("/article/", p("b=ml&k=a&from=%2F"))).toBe("/article?b=ml&k=a")
    expect(entryKey("/inbox/", p("view=new&p=W1"))).toBe("/inbox")
    expect(entryKey("/search/", p("q=probe"))).toBe("/search")
  })

  it("makes a from value only on a list", () => {
    expect(fromHere("/", "")).toBe("/")
    expect(fromHere("/inbox", "?view=new&p=W1")).toBe("/inbox/?view=new&p=W1")
    expect(fromHere("/search/", new URLSearchParams("q=probe array"))).toBe(
      "/search/?q=probe+array"
    )
    expect(fromHere("/article/", "b=ml&k=x")).toBeNull()
    expect(fromHere("/elsewhere/", "")).toBeNull()
  })

  it("reads a from value back", () => {
    expect(parseFrom("/bib/?b=ml&sort=year.asc")).toEqual({
      kind: "bib",
      href: "/bib/?b=ml&sort=year.asc",
      bib: "ml",
      view: null,
      paper: null,
      query: null,
    })
    expect(parseFrom("/inbox/?view=worth&p=W1")).toMatchObject({
      kind: "inbox",
      view: "worth",
      paper: "W1",
    })
    expect(parseFrom("/inbox?view=bogus")).toMatchObject({ kind: "inbox", view: null })
    expect(parseFrom("/search/?q=probe")).toMatchObject({ kind: "search", query: "probe" })
    expect(parseFrom("/")).toMatchObject({ kind: "today", href: "/" })
  })

  it("refuses a from value that is not one of the app's lists", () => {
    for (const bad of [
      "",
      null,
      undefined,
      "bib/?b=ml",
      "//evil.example/bib/?b=ml",
      "/\\evil.example",
      "https://evil.example/bib/?b=ml",
      "javascript:alert(1)",
      "/article/?b=ml&k=x",
      "/bib/",
    ]) {
      expect(parseFrom(bad)).toBeNull()
    }
  })

  it("keys a list's memory without the inbox's current paper", () => {
    expect(listKey("/inbox/?view=new&p=W1")).toBe("/inbox/?view=new")
    expect(listKey("/search/?q=filter&read=ml%2Fa%2Fpaper.pdf%234.1")).toBe("/search/?q=filter")
    expect(listKey("/bib?b=ml&sort=year.asc")).toBe("/bib/?b=ml&sort=year.asc")
    expect(listKey("/")).toBe("/")
  })
})

describe("legacyHashTarget", () => {
  const bibs = new Set(["grassland", "ml"])

  it("maps the former single page's links", () => {
    expect(legacyHashTarget("#inbox", bibs)).toBe("/inbox/")
    expect(legacyHashTarget("#ml", bibs)).toBe("/bib/?b=ml")
    expect(legacyHashTarget("#ml/novak2024", bibs)).toBe("/article/?b=ml&k=novak2024")
    expect(legacyHashTarget("#ml/novak2024/open-points", bibs)).toBe(
      "/article/?b=ml&k=novak2024#open-points"
    )
    expect(legacyHashTarget("#gr%61ssland/lindqvist2026", bibs)).toBe(
      "/article/?b=grassland&k=lindqvist2026"
    )
  })

  it("leaves other hashes alone", () => {
    expect(legacyHashTarget("", bibs)).toBeNull()
    expect(legacyHashTarget("#", bibs)).toBeNull()
    expect(legacyHashTarget("#top", bibs)).toBeNull()
    expect(legacyHashTarget("#a//b", bibs)).toBeNull()
    expect(legacyHashTarget("#a/b/c/d", bibs)).toBeNull()
    expect(legacyHashTarget("#%E0%A4%A", bibs)).toBeNull()
  })
})
