/**
 * The library's data: one fetch of /data/library.json per session, validated once, indexed once.
 *
 *   const lib = useLibrary()   // inside <LibraryBoundary>: suspends while loading, throws on failure
 *
 * The promise lives at module level, so every component reads the same parsed data and React's
 * `use()` sees a stable promise. `reloadLibrary()` forgets it (the error notice's Retry).
 */
import { use, useSyncExternalStore } from "react"
import { z } from "zod"

import { commands } from "@/lib/site"

import { indexLibrary, type DataProblem, type LibraryIndex } from "./model"
import {
  ArticleSchema,
  BibliographyFieldsSchema,
  FORMAT_VERSION,
  HubTableSchema,
  InboxPaperSchema,
  LibraryFrameSchema,
  type Article,
  type Bibliography,
  type HubTable,
  type InboxPaper,
  type Library,
} from "./schema"

export const LIBRARY_URL = "/data/library.json"

export type LibraryErrorKind =
  /** Nothing answers: the app is opened without `glossator serve` running (or the dev proxy cannot reach it). */
  | "unreachable"
  /** The server answers but has no data: `glossator build` has not run. */
  | "missing"
  /** Not JSON, or JSON that does not follow the format. */
  | "invalid"
  /** Another format version than this app reads. */
  | "version"
  /** Any other HTTP error. */
  | "http"

export class LibraryError extends Error {
  override readonly name = "LibraryError"
  constructor(
    readonly kind: LibraryErrorKind,
    message: string,
    /** Technical detail for a disclosure (validation issues, the server's own message). */
    readonly detail?: string
  ) {
    super(message)
  }
}

export function isLibraryError(error: unknown): error is LibraryError {
  return error instanceof LibraryError || (error instanceof Error && error.name === "LibraryError")
}

/** The first lines of a validation error, for a disclosure. */
function issues(error: z.ZodError, lines = 24): string {
  return z.prettifyError(error).split("\n").slice(0, lines).join("\n")
}

/** A string field of raw JSON, to name an item that could not be read. */
function field(raw: unknown, name: string): string | null {
  const v = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)[name] : null
  return typeof v === "string" && v ? v : null
}

/** The items of a list that follow `schema`; the others become problems. */
function readEach<T>(
  items: readonly unknown[],
  schema: z.ZodType<T>,
  problem: (raw: unknown, index: number) => Omit<DataProblem, "detail">,
  problems: DataProblem[]
): T[] {
  const out: T[] = []
  items.forEach((raw, i) => {
    const parsed = schema.safeParse(raw)
    if (parsed.success) out.push(parsed.data)
    else problems.push({ ...problem(raw, i), detail: issues(parsed.error, 6) })
  })
  return out
}

/**
 * Validate and index raw JSON (already parsed); throws a LibraryError of kind version or invalid
 * when the library's frame is wrong. Inside it, a bibliography, a table, an article or an inbox paper
 * that does not follow the format is left out and listed in `problems`.
 */
export function parseLibrary(json: unknown): LibraryIndex {
  const version =
    typeof json === "object" && json !== null ? (json as { version?: unknown }).version : undefined
  if (version !== FORMAT_VERSION) {
    throw new LibraryError(
      version === undefined ? "invalid" : "version",
      version === undefined
        ? "The data has no format version: it is not a library written by glossator build."
        : `The data is in format version ${String(version)}; this app reads version ${FORMAT_VERSION}.`
    )
  }
  const frame = LibraryFrameSchema.safeParse(json)
  if (!frame.success) {
    throw new LibraryError(
      "invalid",
      "The data does not follow the format this app reads.",
      issues(frame.error)
    )
  }
  const problems: DataProblem[] = []
  const bibliographies: Bibliography[] = []
  frame.data.bibliographies.forEach((raw, i) => {
    const fields = BibliographyFieldsSchema.safeParse(raw)
    const name = field(raw, "name") ?? `bibliography ${i + 1}`
    if (!fields.success) {
      problems.push({ kind: "bibliography", ref: name, detail: issues(fields.error, 6) })
      return
    }
    const lists = raw as { tables?: unknown; articles?: unknown }
    const tables = readEach<HubTable>(
      Array.isArray(lists.tables) ? lists.tables : [],
      HubTableSchema,
      (t, j) => ({ kind: "table", ref: `${name}/${field(t, "id") ?? `table ${j + 1}`}` }),
      problems
    )
    const articles = readEach<Article>(
      Array.isArray(lists.articles) ? lists.articles : [],
      ArticleSchema,
      (a, j) => ({ kind: "article", ref: `${name}/${field(a, "key") ?? `article ${j + 1}`}` }),
      problems
    )
    bibliographies.push({ ...fields.data, tables, articles })
  })
  const inbox = frame.data.inbox
  const library: Library = {
    version: frame.data.version,
    built: frame.data.built,
    generated: frame.data.generated,
    bibliographies,
    inbox: inbox && {
      last_run: inbox.last_run,
      papers: readEach<InboxPaper>(
        inbox.papers,
        InboxPaperSchema,
        (p, j) => ({ kind: "inbox paper", ref: field(p, "id") ?? `paper ${j + 1}` }),
        problems
      ),
    },
  }
  return indexLibrary(library, problems)
}

/** One fetch of the data, without the session cache (the hook and loadLibrary cache it). */
export async function fetchLibrary(url: string = LIBRARY_URL): Promise<LibraryIndex> {
  let res: Response
  try {
    res = await fetch(url, { cache: "no-cache", headers: { Accept: "application/json" } })
  } catch (e) {
    throw new LibraryError("unreachable", `Nothing answers at ${url}.`, String(e))
  }
  if (!res.ok) {
    const said = await serverMessage(res)
    if (res.status === 404) {
      throw new LibraryError(
        "missing",
        `There is no library data yet: run ${commands.build}.`,
        said
      )
    }
    // The dev server's proxy answers 500 when glossator serve is not running.
    if (res.status >= 500) {
      throw new LibraryError(
        "unreachable",
        `The server could not reach the data (${res.status}).`,
        said
      )
    }
    throw new LibraryError("http", `The server answered ${res.status} for ${url}.`, said)
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new LibraryError(
      "invalid",
      `${url} is not JSON: serve the app with ${commands.serve}, which answers the data beside it.`
    )
  }
  return parseLibrary(json)
}

let current: Promise<LibraryIndex> | null = null
let generation = 0
const listeners = new Set<() => void>()

/** The session's library (fetched at the first call). Browser only. */
export function loadLibrary(): Promise<LibraryIndex> {
  if (typeof window === "undefined") {
    throw new Error("loadLibrary() runs in the browser only: render data inside <LibraryBoundary>.")
  }
  current ??= fetchLibrary()
  return current
}

/** Forget the cached library: the next read fetches it again, and every LibraryBoundary resets. */
export function reloadLibrary(): void {
  current = null
  generation += 1
  for (const listener of listeners) listener()
}

/** A number that changes at each reloadLibrary(): a reset key for error boundaries. */
export function useLibraryGeneration(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => generation,
    () => 0
  )
}

/**
 * Use data already parsed (tests): the next `useLibrary()` returns it without suspending.
 * Pass null to forget it.
 */
export function primeLibrary(data: Library | LibraryIndex | null): void {
  if (data === null) {
    current = null
    return
  }
  const index = "bibNames" in data ? data : indexLibrary(data)
  // React's use() reads a settled promise synchronously when it carries its status and value.
  const promise = Promise.resolve(index) as Promise<LibraryIndex> & {
    status?: string
    value?: LibraryIndex
  }
  promise.status = "fulfilled"
  promise.value = index
  current = promise
}

/** The library, in a component under <LibraryBoundary> (it suspends, then throws a LibraryError on failure). */
export function useLibrary(): LibraryIndex {
  return use(loadLibrary())
}

/** The `{error}` glossator serve sends with a 4xx; nothing for another server's error page. */
async function serverMessage(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json()
    const error =
      typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined
    return typeof error === "string" ? error : undefined
  } catch {
    return undefined
  }
}
