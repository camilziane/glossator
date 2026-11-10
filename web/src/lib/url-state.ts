/**
 * The search params that name what a route shows, as nuqs parsers: read them with
 * `useQueryStates(articleParams)`, under a <LibraryBoundary> (a static export reads search params in
 * the browser only). A feature's own URL state (sorting, filters) is defined beside the feature.
 */
import { parseAsString, parseAsStringLiteral } from "nuqs"

export const SEARCH_SCOPES = ["all", "records", "text"] as const
export const SEARCH_MODES = ["hybrid", "keyword", "semantic"] as const

/**
 * The inbox's views (`?view=`): New (found by the latest run), Worth a look (relevance 2 or 3),
 * All waiting, Accepted (waiting to be added). Which papers each holds: `@/lib/inbox-views`.
 */
export const INBOX_VIEWS = ["new", "worth", "waiting", "accepted"] as const
export type InboxView = (typeof INBOX_VIEWS)[number]

/** /bib/?b=<name> */
export const bibParams = {
  b: parseAsString.withDefault(""),
}

/**
 * /article/?b=<bib>&k=<key>&from=<list> (a section is the hash, not a param). `from` is the list the
 * article was opened from (read it with `parseFrom`, `@/lib/routes`): its pager pages within it and
 * Esc returns to it.
 */
export const articleParams = {
  b: parseAsString.withDefault(""),
  k: parseAsString.withDefault(""),
  from: parseAsString.withDefault(""),
}

/** /search/?q=&bib=&scope=&mode= */
export const searchParams = {
  q: parseAsString.withDefault(""),
  bib: parseAsString.withDefault(""),
  scope: parseAsStringLiteral(SEARCH_SCOPES).withDefault("all"),
  mode: parseAsStringLiteral(SEARCH_MODES).withDefault("hybrid"),
}

/**
 * /inbox/?view=&p= — the view (null when the URL names none: `defaultInboxView` picks it) and the
 * current paper (follow it with `history: "replace"`, so j/k do not fill the history).
 */
export const inboxViewParams = {
  view: parseAsStringLiteral(INBOX_VIEWS),
  p: parseAsString.withDefault(""),
}
