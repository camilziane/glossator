"use client"

import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The status line: one polite line for what the app has to say (a decision and its Undo, a failure
 * and its Retry, a copy done), instead of stacked toasts. One message at a time: a new one replaces
 * the last.
 *
 *   const status = useStatusLine()
 *   status.show(<>Rejected ‘{short}’</>, { action: { label: "Undo", key: "u", onAction: undo } })
 *   status.show(`Not saved: ‘${short}’ is back in the list.`, { tone: "danger", action: retry })
 *
 * Where it shows: a page places <StatusLine /> where its messages belong (the inbox: at the foot of
 * its list column); on a page that places none, the shell shows it at the bottom left. The action's
 * `key` is shown and named (aria-keyshortcuts); the page handles the key itself, in its own scope.
 */
export interface StatusAction {
  label: string
  /** The page's key for it ("u"), shown beside the label. */
  key?: string
  onAction: () => void
}

export interface StatusOptions {
  action?: StatusAction
  tone?: "neutral" | "danger"
  /**
   * How long it stays (ms): 8 s by default, until replaced for "danger"; null keeps it until
   * replaced or cleared. Hovering or focusing it holds it.
   */
  ttl?: number | null
  /**
   * The words may take more lines instead of being cut (a failure always does: it is never cut, a
   * phone's narrow line included). Default: one line, cut, for a neutral message.
   */
  wrap?: boolean
}

export interface StatusMessage extends Required<Pick<StatusOptions, "tone">> {
  id: number
  message: ReactNode
  action: StatusAction | null
  ttl: number | null
  wrap: boolean
}

export interface StatusLineControl {
  /** Show a message (replacing the current one); returns its id. */
  show: (message: ReactNode, opts?: StatusOptions) => number
  /** Clear the message (only `id` when given: a later message stays). */
  clear: (id?: number) => void
}

const DEFAULT_TTL_MS = 8000

interface State {
  current: StatusMessage | null
  /** The message on its way out (a 90 ms fade). */
  leaving: StatusMessage | null
  /** How many pages placed a StatusLine of their own. */
  placed: number
}

let state: State = { current: null, leaving: null, placed: 0 }
let nextId = 0
let timer: ReturnType<typeof setTimeout> | null = null
let leaveTimer: ReturnType<typeof setTimeout> | null = null
let held = false
const listeners = new Set<() => void>()

function set(next: Partial<State>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function arm(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
  const ttl = state.current?.ttl
  if (held || ttl === null || ttl === undefined) return
  const id = state.current!.id
  timer = setTimeout(() => clearStatus(id), ttl)
}

export function showStatus(message: ReactNode, opts: StatusOptions = {}): number {
  const tone = opts.tone ?? "neutral"
  const ttl = opts.ttl !== undefined ? opts.ttl : tone === "danger" ? null : DEFAULT_TTL_MS
  const id = ++nextId
  const wrap = opts.wrap ?? tone === "danger"
  set({ current: { id, message, action: opts.action ?? null, tone, ttl, wrap }, leaving: null })
  arm()
  return id
}

export function clearStatus(id?: number): void {
  const current = state.current
  if (!current || (id !== undefined && current.id !== id)) return
  if (timer !== null) clearTimeout(timer)
  timer = null
  if (leaveTimer !== null) clearTimeout(leaveTimer)
  set({ current: null, leaving: current })
  leaveTimer = setTimeout(() => set({ leaving: null }), 90)
}

/** Hold the message while the reader points at it or focuses it (WCAG 2.2.1). */
function hold(on: boolean): void {
  held = on
  arm()
}

/** Tests: no message, no page placement. */
export function resetStatusLine(): void {
  if (timer !== null) clearTimeout(timer)
  if (leaveTimer !== null) clearTimeout(leaveTimer)
  timer = leaveTimer = null
  held = false
  state = { current: null, leaving: null, placed: state.placed }
  for (const listener of listeners) listener()
}

const control: StatusLineControl = { show: showStatus, clear: clearStatus }

export function useStatusLine(): StatusLineControl {
  return control
}

function useStatusState(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state
  )
}

function Message({ message, leaving }: { message: StatusMessage; leaving: boolean }) {
  const { action } = message
  return (
    <p
      className={cn(
        "flex min-w-0 items-baseline gap-x-3 text-sm",
        message.tone === "danger" ? "text-danger" : "text-foreground",
        leaving ? "animate-fade-out" : "animate-pop-in [--pop-y:4px]"
      )}
    >
      <span className={cn("min-w-0", message.wrap ? "text-pretty" : "truncate")}>
        {message.message}
      </span>
      {action && !leaving ? (
        <button
          type="button"
          onClick={action.onAction}
          aria-keyshortcuts={action.key}
          className="shrink-0 rounded-[2px] font-medium link text-foreground"
        >
          {action.label}
          {action.key ? (
            <kbd
              data-kbd-hint
              className="ml-1.5 font-sans text-kbd font-normal text-muted-foreground no-underline"
            >
              {action.key}
            </kbd>
          ) : null}
        </button>
      ) : null}
    </p>
  )
}

/**
 * Where the status line shows. A page places it where its messages belong; `className` positions it
 * in the page (it is one line, as wide as its container).
 */
export function StatusLine({ className }: { className?: string }) {
  const { current, leaving } = useStatusState()
  useLayoutEffect(() => {
    set({ placed: state.placed + 1 })
    return () => set({ placed: Math.max(0, state.placed - 1) })
  }, [])
  return <StatusRegion current={current} leaving={leaving} className={className} />
}

function StatusRegion({
  current,
  leaving,
  className,
  framed = false,
}: {
  current: StatusMessage | null
  leaving: StatusMessage | null
  className?: string
  /** A slip of its own (the shell's corner), rather than a line in the page. */
  framed?: boolean
}) {
  const shown = current ?? leaving
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-print="hide"
      data-slot="status-line"
      className={cn("min-h-5", className)}
      onPointerEnter={() => hold(true)}
      onPointerLeave={() => hold(false)}
      onFocus={() => hold(true)}
      onBlur={() => hold(false)}
    >
      {shown ? (
        <div
          className={cn(
            framed &&
              "max-w-[min(36rem,calc(100vw-2rem))] rounded-[4px] border bg-popover px-3 py-2 text-popover-foreground shadow-popover"
          )}
        >
          <Message key={shown.id} message={shown} leaving={current === null} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * The shell's default place for the status line: bottom left (above the phone's tab bar), unless the
 * page placed its own. A message still showing when its page goes (an Undo) moves here.
 */
export function StatusLineCorner() {
  const { current, leaving, placed } = useStatusState()
  if (placed > 0) return null
  return (
    <StatusRegion
      current={current}
      leaving={leaving}
      framed
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 z-40 min-h-0 md:bottom-4"
    />
  )
}
