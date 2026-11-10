import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError, ApiUnavailableError, type decideInbox } from "./api"

import { fixtureLibrary } from "../../tests/utils/fixture"

import {
  flushDecisions,
  lastQueuedDecision,
  probeApi,
  queueDecision,
  readDecideAnswer,
  resetDecisions,
  sendDecision,
  undoDecision,
  UNDO_DELAY_MS,
  useApiState,
  useInboxCounts,
  useOverrides,
} from "./inbox-decisions"

afterEach(() => {
  resetDecisions()
  vi.useRealTimers()
})

type Send = typeof decideInbox

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const answered = (lines: string[]) => vi.fn<Send>(() => Promise.resolve({ done: lines }))

describe("sendDecision", () => {
  it("shows the decision at once, then keeps it when the server confirms", async () => {
    const answer = deferred<{ done: string[] }>()
    const send = vi.fn<Send>(() => answer.promise)
    const { result } = renderHook(() => useOverrides())

    let sent!: ReturnType<typeof sendDecision>
    act(() => {
      sent = sendDecision(["a", "b"], "accept", { send })
    })
    // keepalive: the request outlives a page that closes meanwhile.
    expect(send).toHaveBeenCalledWith(["a", "b"], "accept", { keepalive: true })
    expect(result.current.get("a")).toMatchObject({ status: "accepted", phase: "sending" })

    await act(async () => {
      answer.resolve({ done: ["a: accepted", "b: no such item"] })
      await sent
    })
    expect(result.current.get("a")).toMatchObject({ status: "accepted", phase: "done" })
    // What the server did not do goes back to what it was.
    expect(result.current.has("b")).toBe(false)
    await expect(sent).resolves.toMatchObject({
      kind: "done",
      outcome: { done: ["a"], failed: [{ id: "b", reason: "no such item" }] },
    })
  })

  it("rolls back every paper when the server refuses (a 4xx: nothing was done)", async () => {
    const { result } = renderHook(() => useOverrides())
    let out: Awaited<ReturnType<typeof sendDecision>> | undefined
    await act(async () => {
      out = await sendDecision(["a"], "reject", {
        send: () => Promise.reject(new ApiError(403, "a decision needs the header X-Glossator: 1")),
      })
    })
    expect(out).toEqual({ kind: "refused", message: "a decision needs the header X-Glossator: 1" })
    expect(result.current.size).toBe(0)
  })

  it("restores an earlier decision of the session on a refusal", async () => {
    const { result } = renderHook(() => useOverrides())
    await act(async () => {
      await sendDecision(["a"], "accept", { send: answered(["a: accepted"]) })
    })
    await act(async () => {
      await sendDecision(["a"], "reject", { send: () => Promise.reject(new ApiError(400, "no")) })
    })
    expect(result.current.get("a")).toMatchObject({ status: "accepted", phase: "done" })
  })

  it("reads the data again when the server does not answer, and shows what was saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ semantic: false }), { headers: json }))
    )
    const { result } = renderHook(() => useOverrides())
    const api = renderHook(() => useApiState())
    let out: Awaited<ReturnType<typeof sendDecision>> | undefined
    await act(async () => {
      out = await sendDecision(["a", "b", "c"], "reject", {
        send: () =>
          Promise.reject(
            new ApiError(500, "OSError: disk full (some decisions may be saved: reload)")
          ),
        // a was rejected (it left the data), b was not, c was decided elsewhere.
        readStatuses: async () =>
          new Map([
            ["b", "new"],
            ["c", "accepted"],
          ]),
      })
    })
    expect(out).toMatchObject({
      kind: "checked",
      outcome: {
        done: ["a"],
        failed: [
          { id: "b", reason: "not saved (new)" },
          { id: "c", reason: "not saved (accepted)" },
        ],
      },
    })
    expect(result.current.get("a")).toMatchObject({ status: "rejected", phase: "done" })
    expect(result.current.get("b")).toMatchObject({ status: "new" })
    expect(result.current.get("c")).toMatchObject({ status: "accepted" })
    // The probe answered: the API is still here.
    expect(api.result.current).toBe("available")
  })

  it("says the outcome is unknown when the data cannot be read again, and probes the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed")
      })
    )
    const { result } = renderHook(() => useOverrides())
    const api = renderHook(() => useApiState())
    let out: Awaited<ReturnType<typeof sendDecision>> | undefined
    await act(async () => {
      out = await sendDecision(["a"], "accept", {
        send: () => Promise.reject(new ApiUnavailableError("network")),
      })
    })
    expect(out).toMatchObject({ kind: "unknown", apiAvailable: false })
    expect(result.current.size).toBe(0)
    // Only the failed probe says the API is gone.
    expect(api.result.current).toBe("unavailable")
  })
})

const json = { "Content-Type": "application/json" }

describe("queueDecision", () => {
  it("waits UNDO_DELAY_MS before sending, then sends", async () => {
    vi.useFakeTimers()
    const send = answered(["a: rejected"])
    const { result } = renderHook(() => useOverrides())
    let q!: ReturnType<typeof queueDecision>
    act(() => {
      q = queueDecision(["a"], "reject", { send })
    })
    expect(result.current.get("a")).toMatchObject({ status: "rejected", phase: "queued" })
    expect(lastQueuedDecision()?.id).toBe(q.id)
    await act(async () => {
      vi.advanceTimersByTime(UNDO_DELAY_MS - 1)
    })
    expect(send).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
      await q.done
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(result.current.get("a")).toMatchObject({ status: "rejected", phase: "done" })
    expect(lastQueuedDecision()).toBeNull()
  })

  it("is undone before it leaves: nothing is sent, the paper is what it was", async () => {
    vi.useFakeTimers()
    const send = answered(["a: accepted"])
    const { result } = renderHook(() => useOverrides())
    let q!: ReturnType<typeof queueDecision>
    act(() => {
      q = queueDecision(["a"], "accept", { send })
    })
    let undone = false
    act(() => {
      undone = undoDecision(q.id)
    })
    expect(undone).toBe(true)
    await expect(q.done).resolves.toEqual({ kind: "undone" })
    expect(result.current.has("a")).toBe(false)
    await act(async () => {
      vi.advanceTimersByTime(UNDO_DELAY_MS * 2)
    })
    expect(send).not.toHaveBeenCalled()
    // Too late once sent.
    act(() => {
      q = queueDecision(["b"], "accept", { send, delay: 0 })
    })
    expect(undoDecision(q.id)).toBe(false)
  })

  it("sends what waits at once when the page goes away", async () => {
    const send = answered(["a: rejected", "b: accepted"])
    act(() => {
      queueDecision(["a"], "reject", { send })
      queueDecision(["b"], "accept", { send })
    })
    expect(send).not.toHaveBeenCalled()
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"))
    })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
      [["a"], "reject", { keepalive: true }],
      [["b"], "accept", { keepalive: true }],
    ])
  })

  it("moves a waiting paper to a later decision (a change of mind), and skips one on its way", async () => {
    const send = vi.fn<Send>((ids, decision) =>
      Promise.resolve({ done: ids.map((id) => `${id}: ${decision}ed`) })
    )
    const changed = vi.fn()
    const { result } = renderHook(() => useOverrides())
    let first!: ReturnType<typeof queueDecision>
    let second!: ReturnType<typeof queueDecision>
    act(() => {
      first = queueDecision(["a", "b"], "reject", { send, onChange: changed })
      second = queueDecision(["a"], "accept", { send })
    })
    expect(changed).toHaveBeenCalledWith(["b"])
    expect(second.ids).toEqual(["a"])
    expect(result.current.get("a")).toMatchObject({ status: "accepted", batch: second.id })
    // Undoing the second puts "a" back to what it was before the first.
    act(() => {
      undoDecision(second.id)
    })
    expect(result.current.has("a")).toBe(false)
    await act(async () => {
      flushDecisions()
      await first.done
    })
    expect(send).toHaveBeenCalledWith(["b"], "reject", { keepalive: true })

    // A paper whose decision is on its way is left out of a new one.
    const answer = deferred<{ done: string[] }>()
    act(() => {
      queueDecision(["c"], "reject", { send: () => answer.promise, delay: 0 })
    })
    let third!: ReturnType<typeof queueDecision>
    act(() => {
      third = queueDecision(["c", "d"], "accept", { send })
    })
    expect(third.ids).toEqual(["d"])
    await act(async () => answer.resolve({ done: ["c: rejected"] }))
  })

  it("keeps a later decision when an earlier one on the same paper fails", async () => {
    const first = deferred<{ done: string[] }>()
    const { result } = renderHook(() => useOverrides())
    let a!: ReturnType<typeof queueDecision>
    act(() => {
      a = queueDecision(["p"], "accept", { send: () => first.promise, delay: 0 })
    })
    // The answer to the first is late; meanwhile the session forgets it (a reload of the data).
    act(() => resetDecisions())
    let b!: ReturnType<typeof queueDecision>
    act(() => {
      b = queueDecision(["p"], "reject", { send: answered(["p: rejected"]), delay: 0 })
    })
    await act(async () => {
      await b.done
      first.reject(new ApiError(400, "no"))
      await a.done
    })
    // The refusal of the first does not undo the second.
    expect(result.current.get("p")).toMatchObject({ status: "rejected", phase: "done" })
  })
})

describe("useInboxCounts", () => {
  it("counts the papers to decide and the accepted ones, after this session's decisions", async () => {
    const papers = fixtureLibrary().inbox!.papers
    const { result } = renderHook(() => useInboxCounts(papers))
    expect(result.current).toEqual({ toDecide: 6, accepted: 1 })
    await act(async () => {
      await sendDecision(["sato2026arrays"], "reject", {
        send: answered(["sato2026arrays: rejected"]),
      })
    })
    expect(result.current).toEqual({ toDecide: 5, accepted: 1 })
    await act(async () => {
      await sendDecision(["ghosh2026graph"], "accept", {
        send: answered(["ghosh2026graph: accepted"]),
      })
    })
    expect(result.current).toEqual({ toDecide: 4, accepted: 2 })
  })
})

describe("the server's answer to a decision", () => {
  it("reads each id's line", () => {
    expect(readDecideAnswer(["a: accepted", "b: no such item"], ["a", "b", "c"], "accept")).toEqual(
      {
        done: ["a"],
        failed: [
          { id: "b", reason: "no such item" },
          { id: "c", reason: "no answer from the server" },
        ],
        notes: [],
      }
    )
  })

  it("keeps the lines about the whole decision", () => {
    const out = readDecideAnswer(
      ["ab: rejected", "a: rejected", "inbox: not committed (no git)"],
      ["a", "ab"],
      "reject"
    )
    expect(out.done).toEqual(["a", "ab"])
    expect(out.notes).toEqual(["inbox: not committed (no git)"])
  })
})

describe("probeApi", () => {
  function reply(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: json })
  }

  it("finds the API when /api/status answers, even with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply({ error: "no index yet: run glossator build" }, 404))
    )
    const { result } = renderHook(() => useApiState())
    await act(async () => {
      await probeApi()
    })
    expect(result.current).toBe("available")
  })

  it("says unavailable when a static host answers HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } })
      )
    )
    const { result } = renderHook(() => useApiState())
    await act(async () => {
      await probeApi()
    })
    expect(result.current).toBe("unavailable")
  })
})
