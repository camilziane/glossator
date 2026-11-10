"use client"

import { useSyncExternalStore } from "react"

/** How much of each cell a row shows: one line, two lines, or everything. */
export const ROW_LINES = ["1", "2", "full"] as const
export type RowLines = (typeof ROW_LINES)[number]

export const ROW_LINES_LABELS: Record<RowLines, string> = {
  "1": "1 line",
  "2": "2 lines",
  full: "Full",
}

/** A table this short shows everything until the reader asks for less. */
export const FULL_UP_TO = 15

/** The rows a table starts with: everything when it is short, else two lines. */
export function defaultRowLines(rows: number): RowLines {
  return rows <= FULL_UP_TO ? "full" : "2"
}

const PREFIX = "glossator:hub-rows:"
const CHANGED = "hub:rows"

// When storage is refused (a private window), the choices last until the page reloads.
const unsaved = new Map<string, RowLines>()

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGED, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGED, onChange)
  }
}

export function isRowLines(value: unknown): value is RowLines {
  return typeof value === "string" && (ROW_LINES as readonly string[]).includes(value)
}

function read(key: string, fallback: RowLines): RowLines {
  const kept = unsaved.get(key)
  if (kept) return kept
  try {
    const saved = window.localStorage.getItem(PREFIX + key)
    return isRowLines(saved) ? saved : fallback
  } catch {
    return fallback
  }
}

function write(key: string, next: RowLines) {
  try {
    window.localStorage.setItem(PREFIX + key, next)
    unsaved.delete(key)
  } catch {
    unsaved.set(key, next)
  }
  window.dispatchEvent(new Event(CHANGED))
}

/**
 * The reader's row height for one table of one bibliography (`key`: "<bib>" or "<bib>/<table>"),
 * remembered in this browser (a preference, not part of a shared view). Until the reader chooses,
 * a table of 15 rows or fewer shows everything and a longer one two lines.
 */
export function useRowLines(key: string, rows: number): [RowLines, (lines: RowLines) => void] {
  const fallback = defaultRowLines(rows)
  const lines = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback
  )
  return [lines, (next) => write(key, next)]
}
