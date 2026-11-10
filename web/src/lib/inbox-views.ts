/**
 * The inbox's views, free of React but for one hook: which papers each holds, their counts with this
 * session's decisions, and the view the inbox opens on. The top bar's count, Today's sentence and the
 * inbox's tabs all read them here, so they always agree.
 *
 * - New: undecided papers the latest run found (`found` is the day of `inbox.last_run`).
 * - Worth a look: undecided papers rated 2 (related) or 3 (in scope).
 * - All waiting: every undecided paper.
 * - Accepted: accepted papers waiting to be added to a bibliography.
 */
import type { Inbox, InboxPaper, InboxStatus } from "@/lib/data"
import { statusOf, useOverrides } from "@/lib/inbox-decisions"
import { INBOX_VIEWS, type InboxView } from "@/lib/url-state"

export { INBOX_VIEWS, type InboxView }

export const INBOX_VIEW_LABELS: Record<InboxView, string> = {
  new: "New",
  worth: "Worth a look",
  waiting: "All waiting",
  accepted: "Accepted",
}

/** The relevance from which an undecided paper is worth a look (2 related, 3 in scope). */
export const WORTH_A_LOOK = 2

const DAY = /^(\d{4}-\d{2}-\d{2})/

/**
 * The day of the latest run (YYYY-MM-DD): the date part of `last_run` as the inbox wrote it (its own
 * clock, like `found`). Data without a run date: the latest day a paper was found, so the newest
 * batch is still "new". Null when neither says anything.
 */
export function latestRunDay(inbox: Pick<Inbox, "last_run" | "papers"> | null): string | null {
  if (!inbox) return null
  const run = DAY.exec(inbox.last_run)?.[1]
  if (run) return run
  let latest: string | null = null
  for (const p of inbox.papers) {
    const day = DAY.exec(p.found)?.[1]
    if (day && (latest === null || day > latest)) latest = day
  }
  return latest
}

/** Whether a paper in `status` belongs to a view (`day`: `latestRunDay`). */
export function inView(
  view: InboxView,
  paper: InboxPaper,
  status: InboxStatus,
  day: string | null
): boolean {
  switch (view) {
    case "new":
      return status === "new" && day !== null && paper.found.startsWith(day)
    case "worth":
      return status === "new" && (paper.triage.relevance ?? -1) >= WORTH_A_LOOK
    case "waiting":
      return status === "new"
    case "accepted":
      return status === "accepted"
  }
}

export interface InboxViewCounts extends Record<InboxView, number> {
  /** Undecided papers rated 3 (in scope): Today's "11 of them in scope". */
  inScope: number
}

/** How many papers each view holds, by the status `status` gives (with the session's decisions). */
export function countInboxViews(
  inbox: Pick<Inbox, "last_run" | "papers"> | null,
  status: (paper: InboxPaper) => InboxStatus = (p) => p.status
): InboxViewCounts {
  const counts: InboxViewCounts = { new: 0, worth: 0, waiting: 0, accepted: 0, inScope: 0 }
  if (!inbox) return counts
  const day = latestRunDay(inbox)
  for (const paper of inbox.papers) {
    const s = status(paper)
    for (const view of INBOX_VIEWS) if (inView(view, paper, s, day)) counts[view] += 1
    if (s === "new" && paper.triage.relevance === 3) counts.inScope += 1
  }
  return counts
}

/** The papers of a view, in the data's order (sort them with `compareInboxPapers`). */
export function papersInView(
  inbox: Pick<Inbox, "last_run" | "papers"> | null,
  view: InboxView,
  status: (paper: InboxPaper) => InboxStatus = (p) => p.status
): InboxPaper[] {
  if (!inbox) return []
  const day = latestRunDay(inbox)
  return inbox.papers.filter((p) => inView(view, p, status(p), day))
}

/** The view the inbox opens on when the URL names none: New while it has papers, else Worth a look. */
export function defaultInboxView(counts: Pick<InboxViewCounts, "new">): InboxView {
  return counts.new > 0 ? "new" : "worth"
}

/** The view to show: the URL's when it names one, else the default. */
export function resolveInboxView(
  fromUrl: string | null | undefined,
  counts: Pick<InboxViewCounts, "new">
): InboxView {
  return fromUrl && (INBOX_VIEWS as readonly string[]).includes(fromUrl)
    ? (fromUrl as InboxView)
    : defaultInboxView(counts)
}

/**
 * The views' counts with this session's decisions (a paper decided here leaves New, Worth a look and
 * All waiting at once, everywhere): the top bar, Today, the inbox's tabs.
 */
export function useInboxViewCounts(inbox: Inbox | null): InboxViewCounts {
  const overrides = useOverrides()
  return countInboxViews(inbox, (p) => statusOf(p, overrides))
}
