"use client"

import { useSyncExternalStore } from "react"

import type { SearchMode, SearchScope } from "@/lib/routes"

/**
 * The searches of this tab (sessionStorage), most recent first: what the search page shows before
 * anything is typed. A search counts once its answer has been on screen a moment; typing on (or
 * back) from the last one replaces it rather than adding each prefix.
 */
export interface RecentSearch {
  q: string
  bib: string
  scope: SearchScope
  mode: SearchMode
}

const KEY = "search:recent"
const MAX = 8

const listeners = new Set<() => void>()
let cache: { raw: string | null; list: RecentSearch[] } = { raw: null, list: [] }

function isSearch(value: unknown): value is RecentSearch {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.q === "string" &&
    typeof v.bib === "string" &&
    typeof v.scope === "string" &&
    typeof v.mode === "string"
  )
}

/** The recent searches (none when storage is off). */
export function readRecentSearches(): RecentSearch[] {
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(KEY)
  } catch {
    return []
  }
  if (raw === cache.raw) return cache.list
  let list: RecentSearch[] = []
  try {
    const value: unknown = raw ? JSON.parse(raw) : []
    list = Array.isArray(value) ? value.filter(isSearch).slice(0, MAX) : []
  } catch {
    list = []
  }
  cache = { raw, list }
  return list
}

function same(a: RecentSearch, b: RecentSearch): boolean {
  return a.bib === b.bib && a.scope === b.scope && a.mode === b.mode
}

/** Remember a search (first in the list). */
export function rememberSearch(search: RecentSearch): void {
  const q = search.q.trim()
  if (q.length < 2) return
  const entry = { ...search, q }
  const folded = q.toLowerCase()
  const list = readRecentSearches().filter((s, i) => {
    const other = s.q.toLowerCase()
    if (other === folded && same(s, entry)) return false
    // The last search, typed on or typed back: replaced, not kept beside.
    if (i === 0 && same(s, entry) && (folded.startsWith(other) || other.startsWith(folded)))
      return false
    return true
  })
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify([entry, ...list].slice(0, MAX)))
  } catch {
    return
  }
  for (const listener of listeners) listener()
}

/** Forget the recent searches (tests). */
export function clearRecentSearches(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // Storage off: nothing was kept.
  }
  for (const listener of listeners) listener()
}

const EMPTY: RecentSearch[] = []

/** The recent searches, kept up to date. */
export function useRecentSearches(): RecentSearch[] {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    readRecentSearches,
    () => EMPTY
  )
}
