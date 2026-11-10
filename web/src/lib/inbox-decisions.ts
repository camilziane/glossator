/**
 * This session's decisions on inbox papers, and whether the decision API is here.
 *
 * The library's data is fetched once per session, so a decision does not change it: the decisions
 * live in a store beside it (module level, so they survive leaving the page and coming back) and
 * every page reads a paper's status through them (the inbox, the top bar's count, Today, the palette). A
 * reload of the data agrees with them: the server rewrites the data after each decision.
 *
 * A decision is not sent at once: it waits UNDO_DELAY_MS in a queue (shown as decided, with an Undo
 * that cancels it), then leaves for the server. Leaving the page (closing it, reloading, hiding the
 * tab) sends whatever waits at once, with `keepalive` so the request outlives the page.
 *
 * What the server answers decides what the page shows:
 * - an answer: each id it did is kept, each one it did not goes back to what it was;
 * - a refusal (4xx, `{error}`): nothing was done, every id goes back;
 * - no answer (the connection failed, a 5xx, an answer that is not the protocol's): the outcome is
 *   unknown, since some papers may have been saved. The data is read again to learn the truth, and
 *   the API asked again; only a failed probe says the API is gone.
 */
import { useSyncExternalStore } from "react"
import { z } from "zod"

import { ApiError, decideInbox, getStatus, isAbortError, isApiUnavailable } from "@/lib/api"
import { INBOX_STATUSES, LIBRARY_URL, type InboxPaper, type InboxStatus } from "@/lib/data"

// ---------------------------------------------------------------------------- the protocol

export type Decision = "accept" | "reject"

export const DECIDED_STATUS: Record<Decision, InboxStatus> = {
  accept: "accepted",
  reject: "rejected",
}

export interface DecideOutcome {
  done: string[]
  failed: { id: string; reason: string }[]
  /** Lines about the whole decision ("inbox: not committed (…)"). */
  notes: string[]
}

/**
 * The server's answer, one line per id ("<id>: accepted", "<id>: no such item") and maybe a line
 * about the commit, read per id. An id without a line did not happen.
 */
export function readDecideAnswer(
  lines: readonly string[],
  ids: readonly string[],
  decision: Decision
): DecideOutcome {
  const status = DECIDED_STATUS[decision]
  const out: DecideOutcome = { done: [], failed: [], notes: [] }
  const used = new Set<number>()
  for (const id of ids) {
    const i = lines.findIndex((line, j) => !used.has(j) && line.startsWith(`${id}: `))
    if (i < 0) {
      out.failed.push({ id, reason: "no answer from the server" })
      continue
    }
    used.add(i)
    const said = lines[i]!.slice(id.length + 2).trim()
    if (said === status) out.done.push(id)
    else out.failed.push({ id, reason: said })
  }
  lines.forEach((line, j) => {
    if (!used.has(j)) out.notes.push(line)
  })
  return out
}

// ---------------------------------------------------------------------------- the decisions

/** queued: waiting for its Undo delay; sending: sent, not answered; done: what the server said. */
export type DecisionPhase = "queued" | "sending" | "done"

export interface Override {
  status: InboxStatus
  phase: DecisionPhase
  /** The decision that set it: an answer only touches the papers its own decision still owns. */
  batch: number
}

export type Overrides = ReadonlyMap<string, Override>

const EMPTY: Overrides = new Map()
let overrides: Overrides = EMPTY
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function update(change: (next: Map<string, Override>) => void): void {
  const next = new Map(overrides)
  change(next)
  overrides = next
  for (const listener of listeners) listener()
}

/** The session's decisions, by paper id. */
export function useOverrides(): Overrides {
  return useSyncExternalStore(
    subscribe,
    () => overrides,
    () => EMPTY
  )
}

/** A paper's status once this session's decisions are counted. */
export function statusOf(paper: InboxPaper, overrides: Overrides): InboxStatus {
  return overrides.get(paper.id)?.status ?? paper.status
}

export interface InboxCounts {
  /** Papers waiting for a decision. */
  toDecide: number
  /** Papers accepted, waiting to be added to a bibliography. */
  accepted: number
}

export function countInbox(papers: readonly InboxPaper[], overrides: Overrides): InboxCounts {
  const counts: InboxCounts = { toDecide: 0, accepted: 0 }
  for (const p of papers) {
    const status = statusOf(p, overrides)
    if (status === "new") counts.toDecide += 1
    else if (status === "accepted") counts.accepted += 1
  }
  return counts
}

/** The inbox's counts with this session's decisions (the views' counts: `@/lib/inbox-views`). */
export function useInboxCounts(papers: readonly InboxPaper[]): InboxCounts {
  return countInbox(papers, useOverrides())
}

/** Forget every decision of the session, queued ones included (tests). */
export function resetDecisions(): void {
  for (const batch of batches.values()) if (batch.timer !== null) clearTimeout(batch.timer)
  batches.clear()
  overrides = EMPTY
  api = "unknown"
  probe = null
  probeRun += 1
  for (const listener of listeners) listener()
  for (const listener of apiListeners) listener()
}

// ---------------------------------------------------------------------------- is the API here?

/** "unknown" until the first answer (or failure) of /api/status. */
export type ApiState = "unknown" | "available" | "unavailable"

let api: ApiState = "unknown"
let probe: Promise<void> | null = null
/** Which probe is current: the answer of a forgotten one is ignored. */
let probeRun = 0
const apiListeners = new Set<() => void>()

function setApi(state: ApiState): void {
  if (api === state) return
  api = state
  for (const listener of apiListeners) listener()
}

/** Ask /api/status once: any JSON answer (even an error, like a missing index) means it is here. */
export function probeApi(): Promise<void> {
  if (probe) return probe
  const run = ++probeRun
  probe = getStatus()
    .then(() => {
      if (run === probeRun) setApi("available")
    })
    .catch((e: unknown) => {
      if (run !== probeRun || isAbortError(e)) return
      setApi(isApiUnavailable(e) ? "unavailable" : "available")
    })
  return probe
}

/** Ask again (the notice's "Try again", a decision left without an answer). */
export function reprobeApi(): Promise<void> {
  probe = null
  return probeApi()
}

/** Subscribing asks the server once (stable, so a re-render does not subscribe again). */
function subscribeApi(listener: () => void): () => void {
  apiListeners.add(listener)
  void probeApi()
  return () => apiListeners.delete(listener)
}

export function useApiState(): ApiState {
  return useSyncExternalStore(
    subscribeApi,
    () => api,
    () => "unknown"
  )
}

// ---------------------------------------------------------------------------- deciding

export type DecisionResult =
  /** The server answered: what it did and did not do. */
  | { kind: "done"; outcome: DecideOutcome }
  /** The server refused the whole decision (a 4xx): nothing changed. */
  | { kind: "refused"; message: string }
  /** No answer; the data, read again, says which papers were saved (`outcome.done`). */
  | { kind: "checked"; message: string; outcome: DecideOutcome }
  /** No answer, and the data could not be read again: the papers show what they were. */
  | { kind: "unknown"; message: string; apiAvailable: boolean }
  /** Undone before it was sent. */
  | { kind: "undone" }

export interface DecisionDeps {
  send?: typeof decideInbox
  /** The inbox papers' statuses as the server's data says now (a paper absent has left it). */
  readStatuses?: () => Promise<ReadonlyMap<string, InboxStatus>>
}

const FreshInboxSchema = z
  .object({
    inbox: z
      .object({
        papers: z.array(z.object({ id: z.string(), status: z.enum(INBOX_STATUSES) }).loose()),
      })
      .loose()
      .nullable(),
  })
  .loose()

/** Read /data/library.json again, only for the inbox's statuses. */
async function readStatuses(): Promise<ReadonlyMap<string, InboxStatus>> {
  const res = await fetch(LIBRARY_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = FreshInboxSchema.parse(await res.json())
  return new Map((data.inbox?.papers ?? []).map((p) => [p.id, p.status]))
}

interface Batch {
  readonly id: number
  ids: string[]
  readonly decision: Decision
  /** Each paper's override before this decision, to go back to. */
  readonly before: Map<string, Override | undefined>
  timer: ReturnType<typeof setTimeout> | null
  state: "queued" | "sending"
  readonly deps: DecisionDeps
  readonly onSend?: () => void
  readonly onChange?: (ids: readonly string[]) => void
  readonly done: Promise<DecisionResult>
  readonly settle: (result: DecisionResult) => void
}

/** Decisions queued or on their way, by batch id. */
const batches = new Map<number, Batch>()
let nextBatch = 0

/** How long a decision waits for an Undo before it is sent. */
export const UNDO_DELAY_MS = 6000

export interface QueuedDecision {
  readonly id: number
  readonly ids: readonly string[]
  readonly decision: Decision
  /** Settles once the server answered, or the decision was undone. */
  readonly done: Promise<DecisionResult>
}

export interface QueueOptions extends DecisionDeps {
  /** UNDO_DELAY_MS by default; 0 sends at once. */
  delay?: number
  /** Called when it leaves for the server (never for an undone decision). */
  onSend?: () => void
  /** Called when a later decision took some of its papers (the ids it still holds). */
  onChange?: (ids: readonly string[]) => void
}

/**
 * Decide: the papers take their new status at once, and the request leaves after `delay` unless
 * undone. A paper whose decision is on its way is skipped (its answer would come back over this
 * one); a paper waiting in an earlier queued decision moves to this one (a change of mind).
 */
export function queueDecision(
  ids: readonly string[],
  decision: Decision,
  opts: QueueOptions = {}
): QueuedDecision {
  const id = ++nextBatch
  const status = DECIDED_STATUS[decision]
  const before = new Map<string, Override | undefined>()
  const mine: string[] = []
  for (const paper of new Set(ids)) {
    const current = overrides.get(paper)
    if (current?.phase === "sending") continue
    const earlier = current?.phase === "queued" ? batches.get(current.batch) : undefined
    if (earlier) {
      // The earlier decision never left: this one replaces it for this paper.
      before.set(paper, earlier.before.get(paper))
      leave(earlier, paper)
    } else before.set(paper, current)
    mine.push(paper)
  }
  let settle!: (result: DecisionResult) => void
  const done = new Promise<DecisionResult>((resolve) => (settle = resolve))
  const batch: Batch = {
    id,
    ids: mine,
    decision,
    before,
    timer: null,
    state: "queued",
    deps: { send: opts.send, readStatuses: opts.readStatuses },
    onSend: opts.onSend,
    onChange: opts.onChange,
    done,
    settle,
  }
  if (!mine.length) {
    settle({ kind: "done", outcome: { done: [], failed: [], notes: [] } })
    return { id, ids: mine, decision, done }
  }
  batches.set(id, batch)
  update((next) => {
    for (const paper of mine) next.set(paper, { status, phase: "queued", batch: id })
  })
  hookPageLeave()
  const delay = opts.delay ?? UNDO_DELAY_MS
  if (delay > 0) batch.timer = setTimeout(() => fire(batch), delay)
  else fire(batch)
  return { id, ids: mine, decision, done }
}

/** A paper leaves a queued decision; an emptied one is dropped (undone, in effect). */
function leave(batch: Batch, paper: string): void {
  batch.ids = batch.ids.filter((x) => x !== paper)
  if (batch.ids.length) {
    batch.onChange?.(batch.ids)
    return
  }
  if (batch.timer !== null) clearTimeout(batch.timer)
  batches.delete(batch.id)
  batch.onChange?.([])
  batch.settle({ kind: "undone" })
}

/** Cancel a queued decision: its papers go back to what they were. False once it was sent. */
export function undoDecision(batchId: number): boolean {
  const batch = batches.get(batchId)
  if (!batch || batch.state !== "queued") return false
  if (batch.timer !== null) clearTimeout(batch.timer)
  batches.delete(batchId)
  restore(batch, batch.ids)
  batch.settle({ kind: "undone" })
  return true
}

/** The latest decision that can still be undone. */
export function lastQueuedDecision(): QueuedDecision | null {
  let last: Batch | null = null
  for (const batch of batches.values()) if (batch.state === "queued") last = batch
  return last ? { id: last.id, ids: last.ids, decision: last.decision, done: last.done } : null
}

/** Send every queued decision now (the page is going away). */
export function flushDecisions(): void {
  for (const batch of [...batches.values()]) {
    if (batch.state !== "queued") continue
    if (batch.timer !== null) clearTimeout(batch.timer)
    fire(batch)
  }
}

let leaveHooked = false
function hookPageLeave(): void {
  if (leaveHooked || typeof window === "undefined") return
  leaveHooked = true
  // pagehide covers closing, reloading and leaving; a hidden tab may be discarded without one.
  window.addEventListener("pagehide", flushDecisions)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDecisions()
  })
}

/** Back to what each paper was, for the papers this decision still owns. */
function restore(batch: Batch, ids: readonly string[]): void {
  update((next) => {
    for (const paper of ids) {
      if (next.get(paper)?.batch !== batch.id) continue
      const was = batch.before.get(paper)
      if (was) next.set(paper, was)
      else next.delete(paper)
    }
  })
}

function fire(batch: Batch): void {
  batch.timer = null
  batch.state = "sending"
  update((next) => {
    for (const paper of batch.ids) {
      const o = next.get(paper)
      if (o?.batch === batch.id) next.set(paper, { ...o, phase: "sending" })
    }
  })
  batch.onSend?.()
  void deliver(batch).then((result) => {
    batches.delete(batch.id)
    batch.settle(result)
  })
}

async function deliver(batch: Batch): Promise<DecisionResult> {
  const { ids, decision } = batch
  const status = DECIDED_STATUS[decision]
  const send = batch.deps.send ?? decideInbox
  try {
    const answer = await send(ids, decision, { keepalive: true })
    const outcome = readDecideAnswer(answer.done, ids, decision)
    update((next) => {
      for (const paper of outcome.done)
        if (next.get(paper)?.batch === batch.id)
          next.set(paper, { status, phase: "done", batch: batch.id })
    })
    restore(
      batch,
      outcome.failed.map((f) => f.id)
    )
    setApi("available")
    return { kind: "done", outcome }
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
      restore(batch, ids)
      return { kind: "refused", message: e.message }
    }
    return check(batch, e instanceof Error ? e.message : String(e))
  }
}

/** No answer: read the data again (the server rewrites it after each decision) to learn the truth. */
async function check(batch: Batch, message: string): Promise<DecisionResult> {
  const probing = reprobeApi()
  const fresh = await (batch.deps.readStatuses ?? readStatuses)().catch(() => null)
  await probing
  if (!fresh) {
    restore(batch, batch.ids)
    return { kind: "unknown", message, apiAvailable: api !== "unavailable" }
  }
  const wanted = DECIDED_STATUS[batch.decision]
  const outcome: DecideOutcome = { done: [], failed: [], notes: [] }
  update((next) => {
    for (const paper of batch.ids) {
      // A paper absent from the data has left the inbox: a rejection did that.
      const now = fresh.get(paper) ?? (batch.decision === "reject" ? "rejected" : "added")
      if (now === wanted) outcome.done.push(paper)
      else outcome.failed.push({ id: paper, reason: `not saved (${now})` })
      if (next.get(paper)?.batch === batch.id)
        next.set(paper, { status: now, phase: "done", batch: batch.id })
    }
  })
  return { kind: "checked", message, outcome }
}

/** Send a decision at once (no Undo): the queue's path with no delay. */
export function sendDecision(
  ids: readonly string[],
  decision: Decision,
  deps: DecisionDeps = {}
): Promise<DecisionResult> {
  return queueDecision(ids, decision, { ...deps, delay: 0 }).done
}
