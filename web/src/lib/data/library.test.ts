import { afterEach, describe, expect, it, vi } from "vitest"

import { fixtureJson } from "../../../tests/utils/fixture"

import { fetchLibrary, LibraryError } from "./library"

function answer(body: string, init: ResponseInit & { json?: boolean } = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "Content-Type": init.json === false ? "text/html" : "application/json" },
  })
}

async function failure(): Promise<LibraryError> {
  try {
    await fetchLibrary()
  } catch (e) {
    expect(e).toBeInstanceOf(LibraryError)
    return e as LibraryError
  }
  throw new Error("fetchLibrary() did not fail")
}

describe("fetchLibrary", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("parses and indexes the data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer(JSON.stringify(fixtureJson)))
    )
    const lib = await fetchLibrary()
    expect(lib.bib("grassland")?.short).toBe("Grassland")
    expect(lib.article("ml", "novak2024")?.article.year).toBe(2024)
    expect(lib.inboxPaper("ito2026untriaged")?.triage.relevance).toBeNull()
    expect(lib.bibNames.has("materials")).toBe(true)
  })

  it("says the server is not running when nothing answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")))
    )
    expect((await failure()).kind).toBe("unreachable")
  })

  it("says to run the build when the data is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        answer(JSON.stringify({ error: "no data yet: run glossator build" }), { status: 404 })
      )
    )
    const e = await failure()
    expect(e.kind).toBe("missing")
    expect(e.detail).toBe("no data yet: run glossator build")
  })

  it("says the server is unreachable when the dev proxy fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer("Internal Server Error", { status: 500, json: false }))
    )
    expect((await failure()).kind).toBe("unreachable")
  })

  it("refuses an HTML page served in place of the data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer("<!doctype html><p>hi</p>", { json: false }))
    )
    expect((await failure()).kind).toBe("invalid")
  })
})
