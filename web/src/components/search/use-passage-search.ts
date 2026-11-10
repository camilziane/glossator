"use client"

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react"

import {
  getStatus,
  isAbortError,
  readPassage,
  searchPassages,
  type SearchResponse,
  type StatusResponse,
} from "@/lib/api"
import type { SearchMode, SearchScope } from "@/lib/routes"

import { fileKindOf, type FileKind } from "./snippet"

/** `value`, once it has stopped changing for `ms`; `flush()` takes the current value at once. */
export function useDebouncedValue<T>(value: T, ms: number): [T, () => void] {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    if (Object.is(value, debounced)) return
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, debounced, ms])
  return [debounced, () => setDebounced(value)]
}

export interface PassageQuery {
  q: string
  bib: string
  scope: SearchScope
  mode: SearchMode
  limit: number
}

export type SearchStatus = "idle" | "loading" | "done" | "error"

export interface PassageSearch {
  status: SearchStatus
  /** The answer to the current query; while a new one loads, the previous answer (stale). */
  response: SearchResponse | null
  stale: boolean
  error: unknown
}

interface Settled {
  key: string
  response: SearchResponse | null
  error: unknown
}

function keyOf(query: PassageQuery, attempt: number): string {
  return JSON.stringify([query.q, query.bib, query.scope, query.mode, query.limit, attempt])
}

/**
 * GET /api/search for `query` (nothing for an empty one). Each new query aborts the one in flight;
 * `attempt` forces a new request for the same query (Retry, the meaning model now ready).
 */
export function usePassageSearch(query: PassageQuery, attempt: number): PassageSearch {
  const { q, bib, scope, mode, limit } = query
  const key = keyOf(query, attempt)
  const [settled, setSettled] = useState<Settled | null>(null)
  // The last successful answer, shown (dimmed) while the next one loads.
  const [last, setLast] = useState<SearchResponse | null>(null)

  useEffect(() => {
    if (!q) return
    const controller = new AbortController()
    searchPassages(
      { q, bib: bib || undefined, scope, mode, limit },
      { signal: controller.signal }
    ).then(
      (response) => {
        setSettled({ key, response, error: null })
        setLast(response)
      },
      (error: unknown) => {
        if (!isAbortError(error)) setSettled({ key, response: null, error })
      }
    )
    return () => controller.abort()
  }, [key, q, bib, scope, mode, limit])

  if (!q) return { status: "idle", response: null, stale: false, error: null }
  if (settled?.key !== key) return { status: "loading", response: last, stale: true, error: null }
  if (settled.error) return { status: "error", response: null, stale: false, error: settled.error }
  return { status: "done", response: settled.response, stale: false, error: null }
}

const MEANING_POLL_MS = 4000
const MEANING_POLL_TRIES = 20

/**
 * While searches go by words only because the meaning model is loading, ask /api/status every few
 * seconds and call `onReady` once it is ready (for a minute or so: an index without vectors never is).
 */
export function useWhenMeaningReady(waiting: boolean, onReady: () => void): void {
  const ready = useEffectEvent(onReady)
  useEffect(() => {
    if (!waiting) return
    const controller = new AbortController()
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      if (tries > MEANING_POLL_TRIES) {
        clearInterval(timer)
        return
      }
      getStatus({ signal: controller.signal }).then(
        (status) => {
          if (status.semantic) {
            clearInterval(timer)
            ready()
          }
        },
        () => {}
      )
    }, MEANING_POLL_MS)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [waiting])
}

export type IndexStatus =
  | { state: "loading" }
  | { state: "ready"; status: StatusResponse }
  | { state: "failed"; error: unknown }

/** GET /api/status once: what the index holds, or why there is none here. */
export function useIndexStatus(attempt = 0): IndexStatus {
  const [result, setResult] = useState<{ attempt: number; value: IndexStatus } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    getStatus({ signal: controller.signal }).then(
      (status) => setResult({ attempt, value: { state: "ready", status } }),
      (error: unknown) => {
        if (!isAbortError(error)) setResult({ attempt, value: { state: "failed", error } })
      }
    )
    return () => controller.abort()
  }, [attempt])
  return result?.attempt === attempt ? result.value : { state: "loading" }
}

const texts = new Map<string, string>()

export type PassageText =
  { state: "loading" } | { state: "done"; text: string } | { state: "error"; error: unknown }

/** GET /api/read: a passage's text, or its whole page; answers are kept for the session. */
export function usePassageText(ref: string, wholePage: boolean, attempt = 0): PassageText {
  const cacheKey = `${wholePage ? "page" : "passage"}:${ref}`
  const key = `${cacheKey}:${attempt}`
  const [settled, setSettled] = useState<{ key: string; value: PassageText } | null>(null)
  const cached = texts.get(cacheKey)

  useEffect(() => {
    if (!ref || texts.has(cacheKey)) return
    const controller = new AbortController()
    readPassage(ref, { wholePage, signal: controller.signal }).then(
      ({ text }) => {
        texts.set(cacheKey, text)
        setSettled({ key, value: { state: "done", text } })
      },
      (error: unknown) => {
        if (!isAbortError(error)) setSettled({ key, value: { state: "error", error } })
      }
    )
    return () => controller.abort()
  }, [key, cacheKey, ref, wholePage])

  if (cached !== undefined) return { state: "done", text: cached }
  return settled?.key === key ? settled.value : { state: "loading" }
}

/** The cached text of a passage, when it was read already (to find it in its whole page). */
export function cachedPassageText(ref: string): string | undefined {
  return texts.get(`passage:${ref}`)
}

/**
 * A passage's text, read once and kept (what `y` quotes, before the reader has drawn it); null when
 * it cannot be read.
 */
export function loadPassageText(ref: string): Promise<string | null> {
  const cached = texts.get(`passage:${ref}`)
  if (cached !== undefined) return Promise.resolve(cached)
  return readPassage(ref).then(
    ({ text }) => {
      texts.set(`passage:${ref}`, text)
      return text
    },
    () => null
  )
}

const fileKinds = new Map<string, FileKind>()
const fileKindReads = new Map<string, Promise<void>>()
let kindsVersion = 0
const kindListeners = new Set<() => void>()
const kindSnapshots = new Map<string, ReadonlyMap<string, FileKind>>()

function setFileKind(file: string, kind: FileKind): void {
  fileKinds.set(file, kind)
  kindsVersion += 1
  for (const listener of kindListeners) listener()
}

/** The kinds known of `files` (newline-joined) at `version`: one map per version, for memoized rows. */
function kindsSnapshot(files: string, version: number): ReadonlyMap<string, FileKind> {
  const key = `${version}\n${files}`
  let snapshot = kindSnapshots.get(key)
  if (!snapshot) {
    if (kindSnapshots.size > 32) kindSnapshots.clear()
    const known = new Map<string, FileKind>()
    for (const f of files.split("\n")) {
      const kind = fileKinds.get(f)
      if (kind) known.set(f, kind)
    }
    snapshot = known
    kindSnapshots.set(key, snapshot)
  }
  return snapshot
}

/**
 * What each supplementary PDF of the results is (a referee report, a reporting summary…), read once
 * from its first page: a record's label does not always say (a bare file number). `files` are
 * `<bib>/<key>/<source>`; the map grows as the answers come.
 */
export function useFileKinds(files: readonly string[]): ReadonlyMap<string, FileKind> {
  const version = useSyncExternalStore(
    (onChange) => {
      kindListeners.add(onChange)
      return () => kindListeners.delete(onChange)
    },
    () => kindsVersion,
    () => 0
  )
  const all = files.filter((f) => /\.pdf$/i.test(f)).join("\n")
  useEffect(() => {
    for (const file of all.split("\n")) {
      if (!file || fileKinds.has(file) || fileKindReads.has(file)) continue
      fileKindReads.set(
        file,
        readPassage(`${file}#1`, { wholePage: true }).then(
          ({ text }) => setFileKind(file, fileKindOf(text)),
          () => setFileKind(file, "other")
        )
      )
    }
  }, [all])
  return kindsSnapshot(all, version)
}

/** Forget the read texts and the files' kinds (tests). */
export function clearPassageTexts(): void {
  texts.clear()
  fileKinds.clear()
  fileKindReads.clear()
  kindSnapshots.clear()
}
