/**
 * Typed clients for the API of `glossator serve` (src/glossator/serve.py). Every call takes an
 * AbortSignal, validates the answer with zod and throws:
 *
 * - ApiUnavailableError when there is no API to talk to: nothing answers (network error), the app is
 *   on a static host (an HTML page instead of JSON), or the dev proxy cannot reach glossator serve (5xx);
 *   the UI then hides or disables what needs the API, and says so once.
 * - ApiError when the API answers with an error (`{error}` and a 4xx: a missing index, a bad query;
 *   or a 5xx with the server's words), or an answer that does not follow the protocol.
 * - The AbortError of the signal, untouched, when the caller aborts.
 */
import { z } from "zod"

import type { SearchMode, SearchScope } from "@/lib/routes"
import { commands, DECISION_HEADER, DECISION_HEADER_VALUE } from "@/lib/site"

// ---------------------------------------------------------------------------- answers

export const SearchHitSchema = z.object({
  /** `<bib>/<key>/<source>#<page>.<passage>`, or `<bib>/<key>/record:<field>` (page and passage null). */
  ref: z.string(),
  cite: z.string(),
  snippet: z.string(),
  bib: z.string(),
  key: z.string(),
  /** "paper.pdf", a supplementary file (`supplementary/…`), or `record:<field>`. */
  source: z.string(),
  page: z.number().int().nullable(),
  passage: z.number().int().nullable(),
})

export const SearchResponseSchema = z.object({
  query: z.string(),
  /** The mode used: "keyword" while the meaning model loads, even when hybrid was asked. */
  mode: z.enum(["hybrid", "keyword", "semantic"]),
  hits: z.array(SearchHitSchema),
})

export const ReadResponseSchema = z.object({ ref: z.string(), text: z.string() })

/** The search index's meta (when it was built, its counts) and whether meaning search is ready. */
export const StatusResponseSchema = z
  .object({
    built: z.string().nullable().optional(),
    articles: z.number().optional(),
    files: z.number().optional(),
    pages: z.number().optional(),
    text_passages: z.number().optional(),
    record_passages: z.number().optional(),
    per_bibliography: z.record(z.string(), z.number()).optional(),
    semantic: z.boolean(),
  })
  .loose()

export const DecideResponseSchema = z.object({
  /** One line per id: "<id>: accepted", or why it was not done. */
  done: z.array(z.string()),
})

export type SearchHit = z.infer<typeof SearchHitSchema>
export type SearchResponse = z.infer<typeof SearchResponseSchema>
export type ReadResponse = z.infer<typeof ReadResponseSchema>
export type StatusResponse = z.infer<typeof StatusResponseSchema>
export type DecideResponse = z.infer<typeof DecideResponseSchema>
export type Decision = "accept" | "reject"

// ---------------------------------------------------------------------------- errors

export type ApiUnavailableReason = "network" | "not-json" | "server"

export class ApiUnavailableError extends Error {
  override readonly name = "ApiUnavailableError"
  constructor(
    readonly reason: ApiUnavailableReason,
    message = `The search and inbox API is not available: open the app through ${commands.serve}.`
  ) {
    super(message)
  }
}

export class ApiError extends Error {
  override readonly name = "ApiError"
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export function isApiUnavailable(error: unknown): error is ApiUnavailableError {
  return error instanceof ApiUnavailableError
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

// ---------------------------------------------------------------------------- calls

export interface CallOptions {
  signal?: AbortSignal
}

export interface SearchParams {
  q: string
  bib?: string
  /** An article key, to search one article. */
  article?: string
  scope?: SearchScope
  mode?: SearchMode
  /** 1 to 50 (the server clamps). */
  limit?: number
}

/** GET /api/search: the best passages for a query. */
export function searchPassages(
  params: SearchParams,
  opts: CallOptions = {}
): Promise<SearchResponse> {
  const query = new URLSearchParams({ q: params.q })
  if (params.bib) query.set("bib", params.bib)
  if (params.article) query.set("article", params.article)
  if (params.scope) query.set("scope", params.scope)
  if (params.mode) query.set("mode", params.mode)
  if (params.limit !== undefined) query.set("limit", String(params.limit))
  return call(`/api/search?${query}`, SearchResponseSchema, { signal: opts.signal })
}

/** GET /api/read: a passage's text, or with `wholePage` the text of its whole page. */
export function readPassage(
  ref: string,
  opts: CallOptions & { wholePage?: boolean } = {}
): Promise<ReadResponse> {
  const query = new URLSearchParams({ ref })
  if (opts.wholePage) query.set("page", "1")
  return call(`/api/read?${query}`, ReadResponseSchema, { signal: opts.signal })
}

/** GET /api/status: the index's meta and whether meaning search is ready. */
export function getStatus(opts: CallOptions = {}): Promise<StatusResponse> {
  return call("/api/status", StatusResponseSchema, { signal: opts.signal })
}

/**
 * POST /api/inbox/decide: accept or reject inbox papers (the server commits the decision).
 * `keepalive` lets the request outlive the page (a decision sent as the page closes); it is a fetch,
 * not navigator.sendBeacon, because a beacon cannot carry the decision header.
 */
export function decideInbox(
  ids: readonly string[],
  decision: Decision,
  opts: CallOptions & { keepalive?: boolean } = {}
): Promise<DecideResponse> {
  return call("/api/inbox/decide", DecideResponseSchema, {
    signal: opts.signal,
    keepalive: opts.keepalive,
    method: "POST",
    headers: { "Content-Type": "application/json", [DECISION_HEADER]: DECISION_HEADER_VALUE },
    body: JSON.stringify({ ids, decision }),
  })
}

async function call<T>(url: string, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init.headers } })
  } catch (e) {
    if (isAbortError(e)) throw e
    throw new ApiUnavailableError("network")
  }
  const isJson = (res.headers.get("Content-Type") ?? "").includes("application/json")
  if (!isJson) {
    // A static host answers its own page (or a 404 page) where the API would be.
    throw new ApiUnavailableError(res.status >= 500 ? "server" : "not-json")
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (e) {
    if (isAbortError(e)) throw e
    throw new ApiUnavailableError("not-json")
  }
  if (!res.ok) {
    const error = (body as { error?: unknown } | null)?.error
    if (res.status >= 500 && typeof error !== "string") throw new ApiUnavailableError("server")
    throw new ApiError(res.status, typeof error === "string" ? error : `HTTP ${res.status}`)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      `Unexpected answer from ${url.split("?")[0]}: ${z.prettifyError(parsed.error)}`
    )
  }
  return parsed.data
}
