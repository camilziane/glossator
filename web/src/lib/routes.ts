/**
 * Every internal URL of the app. The app is a static export with one page per route; what a page
 * shows comes from its search params, so links are built here and nowhere else.
 */

import type { InboxStatus } from "./data/schema"
import { INBOX_VIEWS, type InboxView, type SEARCH_MODES, type SEARCH_SCOPES } from "./url-state"

export type SearchScope = (typeof SEARCH_SCOPES)[number]
export type SearchMode = (typeof SEARCH_MODES)[number]

export interface SearchRouteParams {
  q?: string
  bib?: string
  scope?: SearchScope
  mode?: SearchMode
}

export interface InboxRouteParams {
  /** The paper to open (`?p=`). */
  paper?: string
  /** The view (`?view=`); left out, the inbox picks its default. */
  view?: InboxView | null
  /** The paper's status (from `statusOf`): a decided paper is named in the URL so it is shown. */
  status?: InboxStatus
}

export interface ArticleRouteOptions {
  /** The list the article is opened from (`fromHere()` / `useFromHere()`), for its pager and Esc. */
  from?: string | null
}

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) query.set(k, v)
  }
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

function withHash(url: string, hash: string | undefined): string {
  return hash ? `${url}#${encodeURIComponent(hash)}` : url
}

/** The statuses the inbox shows without naming them (its views hold only these). */
const WAITING: readonly InboxStatus[] = ["new", "accepted"]

function inboxRoute(paper?: string | InboxRouteParams, status?: InboxStatus): string {
  const p: InboxRouteParams = typeof paper === "object" ? paper : { paper, status }
  return withQuery("/inbox/", {
    view: p.view ?? undefined,
    p: p.paper || undefined,
    status: p.paper && p.status && !WAITING.includes(p.status) ? p.status : undefined,
  })
}

export const routes = {
  /** Today: what changed, the bibliographies, the latest articles. */
  overview: (): string => "/",
  /** A bibliography's hub; `table` scrolls to one of its tables (articles, kinds…). */
  bib: (name: string, table?: string): string => withHash(withQuery("/bib/", { b: name }), table),
  /**
   * An article; `section` is a section id of its view (overview, details, provenance…), `from` the
   * list it is opened from (its pager pages within it, Esc returns to it).
   */
  article: (bib: string, key: string, section?: string, opts: ArticleRouteOptions = {}): string =>
    withHash(withQuery("/article/", { b: bib, k: key, from: opts.from }), section),
  search: (params: SearchRouteParams = {}): string =>
    withQuery("/search/", {
      q: params.q?.trim() || undefined,
      bib: params.bib,
      scope: params.scope && params.scope !== "all" ? params.scope : undefined,
      mode: params.mode && params.mode !== "hybrid" ? params.mode : undefined,
    }),
  /**
   * The inbox: `routes.inbox()`, one paper `routes.inbox(id, status)` (`?p=<id>`; pass the paper's
   * status, from `statusOf`, so a rejected or added paper is shown), or `routes.inbox({ view, paper })`.
   */
  inbox: inboxRoute,
} as const

/** The search param names each route reads. */
export const PARAMS = {
  bib: "b",
  key: "k",
  query: "q",
  from: "from",
  view: "view",
  paper: "p",
  /** The search's passage open in its reader. */
  read: "read",
} as const

/** "/bib/" and "/bib" alike ("/" stays "/"). */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname
}

interface ParamsLike {
  get(name: string): string | null
}

/**
 * What makes a page a new page, as one string: the route, and for a hub or an article the params
 * that name what it shows. A change of anything else (a filter, a sort, the inbox's current paper)
 * stays on the same page: focus and list memory only act when this changes.
 */
export function entryKey(pathname: string, params: ParamsLike): string {
  const path = normalizePath(pathname)
  switch (path) {
    case "/bib":
      return `/bib?b=${params.get(PARAMS.bib) ?? ""}`
    case "/article":
      return `/article?b=${params.get(PARAMS.bib) ?? ""}&k=${params.get(PARAMS.key) ?? ""}`
    default:
      return path
  }
}

// ---------------------------------------------------------------------------- list contexts

export type ListKind = "today" | "bib" | "search" | "inbox"

/** A list an article can be opened from (the `from` param), read back. */
export interface ListContext {
  kind: ListKind
  /** The list's URL (path and query), where Esc returns. */
  href: string
  /** The bibliography a hub lists (kind "bib"). */
  bib: string | null
  /** The inbox's view (kind "inbox"), when the URL names one. */
  view: InboxView | null
  /** The inbox paper that was current (kind "inbox"). */
  paper: string | null
  /** What was searched (kind "search"). */
  query: string | null
}

const LIST_KINDS: Record<string, ListKind> = {
  "/": "today",
  "/bib": "bib",
  "/search": "search",
  "/inbox": "inbox",
}

/** The URL of a page with a trailing slash (the export's form), its query, no hash. */
function pageHref(pathname: string, search: string | URLSearchParams): string {
  const path = normalizePath(pathname)
  const qs = typeof search === "string" ? search.replace(/^\?/, "") : search.toString()
  const slashed = path === "/" ? "/" : `${path}/`
  return qs ? `${slashed}?${qs}` : slashed
}

/**
 * The `from` value of the list on screen: pass the list page's pathname and search params (the
 * `useFromHere()` hook does). Null for a page that is not a list (an article, the 404).
 */
export function fromHere(pathname: string, search: string | URLSearchParams): string | null {
  return LIST_KINDS[normalizePath(pathname)] ? pageHref(pathname, search) : null
}

/**
 * Reads a `from` param: only an internal URL of a list route counts (never another origin, never a
 * scheme), so it can be followed as it is.
 */
export function parseFrom(value: string | null | undefined): ListContext | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return null
  let url: URL
  try {
    url = new URL(value, "http://app.invalid")
  } catch {
    return null
  }
  if (url.origin !== "http://app.invalid") return null
  const kind = LIST_KINDS[normalizePath(url.pathname)]
  if (!kind) return null
  const get = (name: string) => url.searchParams.get(name) || null
  const bib = kind === "bib" ? get(PARAMS.bib) : null
  if (kind === "bib" && !bib) return null
  const view = get(PARAMS.view)
  return {
    kind,
    href: pageHref(url.pathname, url.searchParams),
    bib,
    view:
      kind === "inbox" && view && (INBOX_VIEWS as readonly string[]).includes(view)
        ? (view as InboxView)
        : null,
    paper: kind === "inbox" ? get(PARAMS.paper) : null,
    query: kind === "search" ? get(PARAMS.query) : null,
  }
}

/**
 * The key a list remembers its row and scroll under (`useListMemory`): its URL without what follows
 * the reader as they move (the inbox's current paper `p`, the search's passage open `read`).
 */
export function listKey(href: string): string {
  let url: URL
  try {
    url = new URL(href, "http://app.invalid")
  } catch {
    return href
  }
  url.searchParams.delete(PARAMS.paper)
  url.searchParams.delete(PARAMS.read)
  return pageHref(url.pathname, url.searchParams)
}

// ---------------------------------------------------------------------------- legacy links

/**
 * Where a link of the former single page (`/#<bib>`, `/#<bib>/<key>`, `/#<bib>/<key>/<section>`,
 * `/#inbox`) now leads, or null when the hash is not one. A one-part hash names a bibliography
 * only if `bibs` (the known bibliography names) has it, so in-page anchors are left alone.
 */
export function legacyHashTarget(hash: string, bibs: ReadonlySet<string>): string | null {
  let h = hash.startsWith("#") ? hash.slice(1) : hash
  try {
    h = decodeURIComponent(h)
  } catch {
    return null
  }
  if (!h) return null
  if (h === "inbox") return routes.inbox()
  const parts = h.split("/")
  if (parts.some((p) => !p) || parts.length > 3) return null
  const [bib, key, section] = parts as [string, string | undefined, string | undefined]
  if (key) return routes.article(bib, key, section)
  return bibs.has(bib) ? routes.bib(bib) : null
}
