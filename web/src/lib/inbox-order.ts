import type { InboxPaper } from "./data"

const desc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1)
const descText = (a: string, b: string) => (a === b ? 0 : a < b ? 1 : -1)

/** Relevance (untriaged last), then the prior's score (unscored last). */
export function compareRelevance(a: InboxPaper, b: InboxPaper): number {
  return (
    desc(a.triage.relevance, b.triage.relevance) ||
    desc(a.prior?.score ?? null, b.prior?.score ?? null)
  )
}

/**
 * The inbox's order, "first in line" first: relevance, then the prior, then the most recently found,
 * then the newest published. Ties keep the data's order (sort is stable).
 */
export function compareInboxPapers(a: InboxPaper, b: InboxPaper): number {
  return compareRelevance(a, b) || descText(a.found, b.found) || descText(a.date, b.date)
}
