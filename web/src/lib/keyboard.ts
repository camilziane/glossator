/** Shared rules of the app's keyboard shortcuts (pages, the inbox, the shell, the shortcuts dialog). */

const TEXT_FIELDS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"]'

const CLOSING_DIALOG =
  '[role="dialog"][data-state="closed"], [role="alertdialog"][data-state="closed"]'

/** True when a key press is typing (an input, a text area, an editable region): shortcuts stay out. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  // A field of a dialog on its way out (its exit animation, the focus not yet given back): the
  // reader closed it, so the next key is the page's (Esc then ? at once opens the shortcuts).
  if (target.closest(CLOSING_DIALOG)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest(TEXT_FIELDS) !== null
}

/** A dialog, a sheet, a popover's menu or a listbox is open: its keys are its own. */
export function overlayOpen(): boolean {
  return (
    document.querySelector(
      ["dialog", "alertdialog", "menu", "listbox"]
        .map((role) => `[role="${role}"][data-state="open"]`)
        .join()
    ) !== null
  )
}

/** A key pressed alone (no ⌘, Ctrl or Alt; Shift is part of "?"), and not already handled. */
export function isPlainKey(e: KeyboardEvent): boolean {
  return !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.altKey
}

/**
 * Whether an app-wide key (a `g` chord, `/`, `?`) may act: pressed alone, not held down, not while
 * typing, not over a dialog or a menu.
 */
export function isGlobalKey(e: KeyboardEvent): boolean {
  return isPlainKey(e) && !e.repeat && !isTypingTarget(e.target) && !overlayOpen()
}

// ---------------------------------------------------------------------------- chords

/** How long the second key of a chord (`g` then `i`) may wait. */
export const CHORD_TIMEOUT_MS = 1000

/** The key that opens a chord. Reserved app-wide: no page binds `g` alone. */
export const CHORD_PREFIX = "g"

/** Where a `g` chord goes: a page, or the n-th bibliography (1-based, as the top bar lists them). */
export type GoTarget = "today" | "inbox" | "search" | { bib: number }

/** The second key of a `g` chord, read: `g t` Today, `g i` Inbox, `g s` Search, `g 1`…`g 9`. */
export function goTarget(key: string): GoTarget | null {
  switch (key) {
    case "t":
      return "today"
    case "i":
      return "inbox"
    case "s":
      return "search"
    default:
      return /^[1-9]$/.test(key) ? { bib: Number(key) } : null
  }
}

const MODIFIERS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Fn"])

export type ChordStep =
  /** The prefix: the next key completes the chord. */
  | { kind: "started" }
  /** A chord completed. */
  | { kind: "go"; target: GoTarget }
  /** The prefix was followed by a key that means nothing: the chord is dropped, the key swallowed. */
  | { kind: "dropped" }
  /** Not a chord key: the page may use it. */
  | { kind: "none" }

/**
 * The state of `g` chords, fed one key at a time with the time it was pressed (testable without
 * timers). A chord left waiting longer than `timeout` is forgotten.
 */
export function createChordReader(timeout = CHORD_TIMEOUT_MS) {
  let startedAt: number | null = null
  const waiting = (now: number) => startedAt !== null && now - startedAt <= timeout
  return {
    read(key: string, now: number): ChordStep {
      // A modifier pressed on its way to the second key (Shift for the digits of some layouts).
      if (MODIFIERS.has(key)) return { kind: "none" }
      if (waiting(now)) {
        startedAt = null
        const target = goTarget(key)
        return target ? { kind: "go", target } : { kind: "dropped" }
      }
      startedAt = null
      if (key === CHORD_PREFIX) {
        startedAt = now
        return { kind: "started" }
      }
      return { kind: "none" }
    },
    /** Whether a chord waits for its second key at `now`. */
    pending(now: number): boolean {
      return waiting(now)
    },
    cancel(): void {
      startedAt = null
    },
  }
}

export type ChordReader = ReturnType<typeof createChordReader>
