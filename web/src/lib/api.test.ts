import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ApiError,
  ApiUnavailableError,
  decideInbox,
  getStatus,
  readPassage,
  searchPassages,
} from "./api"
import { DECISION_HEADER } from "./site"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })

const hit = {
  ref: "ml/novak2024/paper.pdf#3.2",
  cite: "Novak & Ito 2024",
  snippet: "a five-tap …",
  bib: "ml",
  key: "novak2024",
  source: "paper.pdf",
  page: 3,
  passage: 2,
}

describe("the API client", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("searches with the given params and validates the answer", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      json({ query: "filter", mode: "keyword", hits: [hit] })
    )
    vi.stubGlobal("fetch", fetchMock)
    const res = await searchPassages({
      q: "filter",
      bib: "ml",
      scope: "text",
      mode: "hybrid",
      limit: 5,
    })
    expect(res.hits[0]?.page).toBe(3)
    expect(res.mode).toBe("keyword")
    const url = new URL(fetchMock.mock.calls[0]![0], "http://x")
    expect(url.pathname).toBe("/api/search")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "filter",
      bib: "ml",
      scope: "text",
      mode: "hybrid",
      limit: "5",
    })
  })

  it("reads a passage or its whole page", async () => {
    const fetchMock = vi.fn(async (_url: string) => json({ ref: hit.ref, text: "…" }))
    vi.stubGlobal("fetch", fetchMock)
    await readPassage(hit.ref, { wholePage: true })
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/read?ref=${encodeURIComponent(hit.ref)}&page=1`)
  })

  it("posts a decision with the header the server requires", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ done: ["a: accepted"] })
    )
    vi.stubGlobal("fetch", fetchMock)
    expect(await decideInbox(["a"], "accept")).toEqual({ done: ["a: accepted"] })
    const init = fetchMock.mock.calls[0]![1]!
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>)[DECISION_HEADER]).toBe("1")
    expect(JSON.parse(String(init.body))).toEqual({ ids: ["a"], decision: "accept" })
  })

  it("turns an {error} answer into an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "no index yet: run glossator build" }, 404))
    )
    await expect(getStatus()).rejects.toEqual(
      new ApiError(404, "no index yet: run glossator build")
    )
  })

  it("says the API is unavailable: network, static host, dev proxy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")))
    )
    await expect(getStatus()).rejects.toMatchObject({
      name: "ApiUnavailableError",
      reason: "network",
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<!doctype html>", { status: 404, headers: { "Content-Type": "text/html" } })
      )
    )
    await expect(getStatus()).rejects.toBeInstanceOf(ApiUnavailableError)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("proxy error", { status: 500 }))
    )
    await expect(getStatus()).rejects.toMatchObject({ reason: "server" })
  })

  it("lets an abort through untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError")))
    )
    await expect(searchPassages({ q: "x" }, { signal: AbortSignal.abort() })).rejects.toMatchObject(
      { name: "AbortError" }
    )
  })

  it("refuses an answer of the wrong shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ query: "x", mode: "fast", hits: [] }))
    )
    await expect(searchPassages({ q: "x" })).rejects.toBeInstanceOf(ApiError)
  })
})
