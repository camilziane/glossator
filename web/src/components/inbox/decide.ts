/**
 * A decision as the reader sees it: one line in the status line (`@/components/shell/status-line`)
 * that says what was decided and offers Undo (u) while the decision waits (lib/inbox-decisions queues
 * it), then, only when something went wrong, says so in the danger tone with a Retry. Each decision
 * replaces the line of the one before (no stack of messages); a failure stays until the next
 * message. The line is the only place a decision speaks (its region is polite and atomic), and it
 * outlives the inbox page: on another page the shell shows it in its corner.
 *
 * Failures add up: each paper a decision could not save is remembered (`useFailedDecisions`: its
 * row says "Not saved" until it is decided again), and once several are, the line counts them all
 * ("10 decisions not saved", with a Retry all).
 */
import { useSyncExternalStore } from "react"

import { clearStatus, showStatus } from "@/components/shell/status-line"
import {
  queueDecision,
  undoDecision,
  type Decision,
  type DecisionResult,
  type QueueOptions,
  type QueuedDecision,
} from "@/lib/inbox-decisions"
import { commands } from "@/lib/site"

export interface DecisionWords {
  /** ‘Short title…’ for one paper (about `max` characters), "3 papers" for several. */
  name: (ids: readonly string[], max?: number) => string
  /** A paper's title. */
  title: (id: string) => string
}

export type DecideOptions = QueueOptions & {
  /** The papers are back (undone): to make one the current paper again. */
  onUndone?: (ids: readonly string[]) => void
}

/** The id of the status line message the inbox showed last (a later one of ours replaces it). */
let lastShown: number | null = null

function say(...args: Parameters<typeof showStatus>): number {
  lastShown = showStatus(...args)
  return lastShown
}

/** Whether our message `id` is still the one showing (no later decision replaced it). */
function showing(id: number): boolean {
  return lastShown === id
}

// ---------------------------------------------------------------------------- failures

/** A paper a decision could not save: what was asked and why it failed, in words. */
export interface FailedDecision {
  id: string
  decision: Decision
  reason: string
}

const NO_FAILURES: ReadonlyMap<string, FailedDecision> = new Map()
let failures: ReadonlyMap<string, FailedDecision> = NO_FAILURES
const failureListeners = new Set<() => void>()
/** What retries them: the words and options of the latest failed decision. */
let retryWith: { words: DecisionWords; opts: DecideOptions } | null = null

function setFailures(next: ReadonlyMap<string, FailedDecision>): void {
  failures = next
  for (const listener of failureListeners) listener()
}

function forget(ids: readonly string[]): void {
  if (!ids.some((id) => failures.has(id))) return
  const next = new Map(failures)
  for (const id of ids) next.delete(id)
  setFailures(next)
}

/** The papers this session's decisions could not save, by id (until decided again). */
export function useFailedDecisions(): ReadonlyMap<string, FailedDecision> {
  return useSyncExternalStore(
    (listener) => {
      failureListeners.add(listener)
      return () => failureListeners.delete(listener)
    },
    () => failures,
    () => NO_FAILURES
  )
}

/** Tests: no failure remembered. */
export function resetFailedDecisions(): void {
  retryWith = null
  setFailures(NO_FAILURES)
}

/** Decide again every paper not saved, each with its own decision. */
export function retryFailedDecisions(): void {
  const using = retryWith
  if (!using || !failures.size) return
  const by: Record<Decision, string[]> = { accept: [], reject: [] }
  for (const f of failures.values()) by[f.decision].push(f.id)
  for (const decision of ["accept", "reject"] as const)
    if (by[decision].length) decideWithUndo(by[decision], decision, using.words, using.opts)
}

const VERB: Record<Decision, { done: string; lower: string }> = {
  accept: { done: "Accepted", lower: "accepted" },
  reject: { done: "Rejected", lower: "rejected" },
}

/** Accept or reject with an Undo: said at once in the status line, sent after the Undo delay. */
export function decideWithUndo(
  ids: readonly string[],
  decision: Decision,
  words: DecisionWords,
  opts: DecideOptions = {}
): QueuedDecision {
  const { done: verb } = VERB[decision]
  let message = -1
  // Decided again: no longer a failure.
  forget(ids)
  // Set once queued; with no delay it is sent (onSend) before queueDecision returns.
  let queued: QueuedDecision | null = null
  // The papers it still holds (a later decision may take some).
  let current: readonly string[] = ids
  const waiting = (list: readonly string[]) => {
    message = say(`${verb} ${words.name(list)}`, {
      action: {
        label: "Undo",
        key: "u",
        onAction: () => {
          if (queued) undoDecision(queued.id)
        },
      },
      ttl: null,
    })
  }
  waiting(ids)
  queued = queueDecision(ids, decision, {
    ...opts,
    onSend: () => {
      // It can no longer be undone: the line keeps its words, without the Undo, and goes in time.
      if (showing(message)) message = say(`${verb} ${words.name(current)}`)
      opts.onSend?.()
    },
    onChange: (list) => {
      current = list
      // A later decision took some of its papers (a change of mind): it speaks for them now.
      if (list.length && showing(message)) waiting(list)
      opts.onChange?.(list)
    },
  })
  if (queued.ids.length !== ids.length) {
    if (queued.ids.length) waiting(queued.ids)
    else if (showing(message)) clearStatus(message)
  }
  current = queued.ids
  void queued.done.then((result) => {
    if (result.kind === "undone") {
      if (current.length) {
        const back = current.length === 1 ? "is back in the list" : "are back in the list"
        message = say(`Undone: ${words.name(current)} ${back}`)
        opts.onUndone?.(current)
      }
      return
    }
    report(result, { decision, ids: current, words, opts, message })
  })
  return queued
}

/** What the server did, said only when it is not what the line already says. */
function report(
  result: Exclude<DecisionResult, { kind: "undone" }>,
  {
    decision,
    ids,
    words,
    opts,
    message,
  }: {
    decision: Decision
    ids: readonly string[]
    words: DecisionWords
    opts: DecideOptions
    message: number
  }
): void {
  const { done: verb, lower } = VERB[decision]
  const fail = (list: readonly string[], reason: string, single: string) =>
    failed(
      list.map((id) => ({ id, decision, reason })),
      single,
      { words, opts }
    )
  switch (result.kind) {
    case "refused":
      fail(
        ids,
        result.message,
        `Not ${lower}: ${words.name(ids, SHORTER)}. ${sentence(result.message)}`
      )
      return
    case "unknown": {
      const reason = result.apiAvailable ? "no answer" : `no answer from ${commands.serve}`
      fail(
        ids,
        reason,
        result.apiAvailable
          ? `${capital(words.name(ids, SHORTER))} may not be ${lower}: no answer. Reload to see what was saved.`
          : `${capital(words.name(ids, SHORTER))} may not be ${lower}: no answer from ${commands.serve}.`
      )
      return
    }
    case "checked":
    case "done": {
      const { failed: notDone, notes } = result.outcome
      if (notDone.length) {
        const byReason = new Map<string, string[]>()
        for (const f of notDone) {
          const reason = reasonWords(f.reason)
          byReason.set(reason, [...(byReason.get(reason) ?? []), f.id])
        }
        const list = notDone.map((f) => f.id)
        failed(
          notDone.map((f) => ({ id: f.id, decision, reason: reasonWords(f.reason) })),
          `Not ${lower}: ${words.name(list, SHORTER)} (${[...byReason.keys()].join("; ")}).`,
          { words, opts }
        )
        return
      }
      if (notes.length && showing(message)) {
        say(`${verb} ${words.name(result.outcome.done)}. The server says: ${notes.join(" · ")}`)
      }
    }
  }
}

/**
 * Remember papers not saved and say so: the decision's own sentence when they are the only ones,
 * else the count of every paper not saved, with a Retry all.
 */
function failed(
  list: readonly FailedDecision[],
  single: string,
  using: { words: DecisionWords; opts: DecideOptions }
): void {
  // Every paper not saved stays remembered (its row says so) until it is decided again.
  const next = new Map(failures)
  for (const f of list) next.set(f.id, f)
  setFailures(next)
  retryWith = using
  if (next.size === list.length) {
    const ids = list.map((f) => f.id)
    const decision = list[0]!.decision
    say(single, {
      tone: "danger",
      action: {
        label: "Retry",
        onAction: () => void decideWithUndo(ids, decision, using.words, using.opts),
      },
    })
    return
  }
  // One reason for them all is worth saying ("no answer from glossator serve"), unless it is the words.
  const reasons = [...new Set([...next.values()].map((f) => f.reason))]
  const why = reasons.length === 1 && reasons[0] !== "not saved" ? ` (${reasons[0]})` : ""
  say(`${next.size} decisions not saved${why}.`, {
    tone: "danger",
    action: { label: "Retry all", onAction: retryFailedDecisions },
  })
}

/** A failure says more than a success: its paper's title is shorter there, so the line holds both. */
const SHORTER = 26

/** The server's reason for one paper, in words ("not saved (new)" is the data read again). */
function reasonWords(reason: string): string {
  if (/^not saved\b/.test(reason)) return "not saved"
  if (reason === "no answer from the server") return "no answer"
  return reason
}

function sentence(text: string): string {
  const t = text.trim()
  if (!t) return ""
  return /[.!?]$/.test(t) ? capital(t) : `${capital(t)}.`
}

function capital(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text
}
