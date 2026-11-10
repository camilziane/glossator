import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetStatusLine, StatusLine } from "@/components/shell/status-line"
import { ApiError } from "@/lib/api"
import { flushDecisions, resetDecisions, undoDecision, useOverrides } from "@/lib/inbox-decisions"

import { fixtureLibrary } from "../../../tests/utils/fixture"

import { decideWithUndo, resetFailedDecisions, type DecisionWords } from "./decide"
import { shortTitle } from "./inbox-model"

const papers = fixtureLibrary().inbox!.papers.filter((p) => p.status === "new")
const [first, second] = papers

const words: DecisionWords = {
  name: (ids, max) =>
    ids.length === 1
      ? `‘${shortTitle(papers.find((p) => p.id === ids[0])!.title, max)}’`
      : `${ids.length} papers`,
  title: (id) => papers.find((p) => p.id === id)!.title,
}

const line = () => document.querySelector("[data-slot=status-line]")!

/** The status line, and the session's decisions (so a test sees a paper's status). */
function Harness() {
  useOverrides()
  return <StatusLine />
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  resetDecisions()
  resetFailedDecisions()
  resetStatusLine()
})
afterEach(() => {
  resetDecisions()
  resetFailedDecisions()
  resetStatusLine()
})

describe("decideWithUndo", () => {
  it("says the decision at once with an Undo (u), then keeps the words without it once sent", async () => {
    const send = vi.fn(async (ids: readonly string[]) => ({
      done: ids.map((id) => `${id}: rejected`),
    }))
    render(<Harness />)
    act(() => void decideWithUndo([first!.id], "reject", words, { send }))
    expect(line()).toHaveTextContent(`Rejected ‘${shortTitle(first!.title)}’`)
    const undo = screen.getByRole("button", { name: /Undo/ })
    expect(undo).toHaveAttribute("aria-keyshortcuts", "u")
    expect(send).not.toHaveBeenCalled()

    await act(async () => flushDecisions())
    await settle()
    expect(send).toHaveBeenCalledOnce()
    expect(line()).toHaveTextContent(`Rejected ‘${shortTitle(first!.title)}’`)
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull()
  })

  it("undoes from its own Undo: nothing is sent, and the line says the paper is back", async () => {
    const send = vi.fn()
    const onUndone = vi.fn()
    render(<Harness />)
    act(() => void decideWithUndo([first!.id], "accept", words, { send, onUndone }))
    await userEvent.click(screen.getByRole("button", { name: /Undo/ }))
    await settle()
    expect(line()).toHaveTextContent(`Undone: ‘${shortTitle(first!.title)}’ is back in the list`)
    expect(onUndone).toHaveBeenCalledWith([first!.id])
    await act(async () => flushDecisions())
    expect(send).not.toHaveBeenCalled()
  })

  it("lets a later decision's line stand when an earlier one is answered", async () => {
    let answer!: (v: { done: string[] }) => void
    const slow = vi.fn(() => new Promise<{ done: string[] }>((resolve) => (answer = resolve)))
    render(<Harness />)
    act(() => void decideWithUndo([first!.id], "accept", words, { send: slow, delay: 0 }))
    act(() => void decideWithUndo([second!.id], "accept", words, { send: vi.fn() }))
    expect(line()).toHaveTextContent(`Accepted ‘${shortTitle(second!.title)}’`)
    await act(async () => answer({ done: [`${first!.id}: accepted`] }))
    await settle()
    // The first was saved: the line still offers the second's Undo.
    expect(line()).toHaveTextContent(`Accepted ‘${shortTitle(second!.title)}’`)
    expect(screen.getByRole("button", { name: /Undo/ })).toBeVisible()
  })

  it("says a refusal in the danger tone, naming the paper once, with a Retry", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(403, "a decision needs the header X-Glossator: 1"))
      .mockImplementationOnce(async (ids: readonly string[]) => ({
        done: ids.map((id) => `${id}: rejected`),
      }))
    render(<Harness />)
    act(() => void decideWithUndo([first!.id], "reject", words, { send }))
    await act(async () => flushDecisions())
    await settle()
    const text = line().textContent ?? ""
    expect(text).toMatch(/^Not rejected: ‘.+’\. A decision needs the header X-Glossator: 1\./)
    expect(text.split(shortTitle(first!.title, 26).slice(0, 12)).length).toBe(2)
    expect(line().querySelector("p")).toHaveClass("text-danger")
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    // Retried: queued again with its Undo, then sent.
    expect(screen.getByRole("button", { name: /Undo/ })).toBeVisible()
    await act(async () => flushDecisions())
    await settle()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("says which papers were not decided, with their reason in words", async () => {
    const send = vi.fn(async (ids: readonly string[]) => ({
      done: [`${ids[0]}: accepted`, `${ids[1]}: no such item`],
    }))
    render(<Harness />)
    act(() => void decideWithUndo([first!.id, second!.id], "accept", words, { send }))
    expect(line()).toHaveTextContent("Accepted 2 papers")
    await act(async () => flushDecisions())
    await settle()
    expect(line()).toHaveTextContent(
      `Not accepted: ‘${shortTitle(second!.title, 26)}’ (no such item).`
    )
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible()
  })

  it("adds failures up: one line counts them, Retry all decides each again", async () => {
    const refuse = vi.fn().mockRejectedValue(new ApiError(403, "read-only server"))
    render(<Harness />)
    act(() => void decideWithUndo([first!.id], "reject", words, { send: refuse }))
    await act(async () => flushDecisions())
    await settle()
    expect(line()).toHaveTextContent(/^Not rejected: ‘/)
    act(() => void decideWithUndo([second!.id], "accept", words, { send: refuse }))
    await act(async () => flushDecisions())
    await settle()
    expect(line()).toHaveTextContent("2 decisions not saved (read-only server).")
    const accepted = vi.fn(async (ids: readonly string[], _decision: string) => ({
      done: ids.map((id) => `${id}: ${id === first!.id ? "rejected" : "accepted"}`),
    }))
    // The retries take the options of the last failure: its sender, now answering.
    refuse.mockImplementation(accepted)
    await userEvent.click(screen.getByRole("button", { name: "Retry all" }))
    await act(async () => flushDecisions())
    await settle()
    expect(accepted.mock.calls.map((c) => [c[0], c[1]])).toEqual(
      expect.arrayContaining([
        [[second!.id], "accept"],
        [[first!.id], "reject"],
      ])
    )
  })

  it("undoes nothing that was sent", async () => {
    let answer!: (v: { done: string[] }) => void
    const send = vi.fn(() => new Promise<{ done: string[] }>((resolve) => (answer = resolve)))
    render(<Harness />)
    let queued!: ReturnType<typeof decideWithUndo>
    act(() => void (queued = decideWithUndo([first!.id], "reject", words, { send })))
    await act(async () => flushDecisions())
    expect(undoDecision(queued.id)).toBe(false)
    await act(async () => answer({ done: [`${first!.id}: rejected`] }))
    await settle()
    expect(line()).toHaveTextContent(`Rejected ‘${shortTitle(first!.title)}’`)
  })
})
