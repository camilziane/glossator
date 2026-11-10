/**
 * The words the app uses for data values, in one place so every page says the same: an inbox
 * paper's relevance (Haiku's triage) and the notices Crossref publishes about an article.
 */
import { isSeriousNotice, type Notice } from "./data/schema"

// ---------------------------------------------------------------------------- relevance

/** Haiku's relevance of an inbox paper, 0 to 3 (the scout's scale, .claude/agents/scout.md). */
export type Relevance = 0 | 1 | 2 | 3

/** Most relevant first. */
export const RELEVANCE_LEVELS: readonly Relevance[] = [3, 2, 1, 0]

export const RELEVANCE: Record<Relevance, { label: string; help: string }> = {
  3: { label: "In scope", help: "Squarely in the bibliography's scope." },
  2: {
    label: "Related",
    help: "Clearly related: a close modality, a neighbouring task, a review.",
  },
  1: { label: "Loosely related", help: "Shares a term or a technique; of little use." },
  0: { label: "Unrelated", help: "The query matched by chance." },
}

/** A paper Haiku has not rated (not triaged yet). */
export const NOT_RATED = "Not rated"

export function isRelevance(n: unknown): n is Relevance {
  return n === 0 || n === 1 || n === 2 || n === 3
}

/** "In scope", "Related"…, "Not rated" for null. */
export function relevanceLabel(level: number | null | undefined): string {
  if (level === null || level === undefined) return NOT_RATED
  return isRelevance(level) ? RELEVANCE[level].label : `Relevance ${level}`
}

/**
 * What a relevance mark says to a screen reader (the mark itself is a glyph): "Relevance 3 of 3: In
 * scope", "Relevance: not rated".
 */
export function relevanceDescription(level: number | null | undefined): string {
  return isRelevance(level)
    ? `Relevance ${level} of 3: ${RELEVANCE[level].label}`
    : level === null || level === undefined
      ? "Relevance: not rated"
      : relevanceLabel(level)
}

/** The prior in words, as a gloss says it: "closest to ML methods". */
export function priorWords(bibLabel: string): string {
  return `closest to ${bibLabel}`
}

/** How the prior scored a paper, in words ("by similarity to its articles"). */
export function priorMethod(by: string): string {
  switch (by) {
    case "similarity":
      return "by similarity to its articles"
    case "model":
      return "by a model trained on past decisions"
    default:
      return `by ${by}`
  }
}

// ---------------------------------------------------------------------------- notices

const NOTICE_WORDS: Record<string, { badge: string; sentence: string }> = {
  retraction: { badge: "Retracted", sentence: "This article was retracted" },
  withdrawal: { badge: "Withdrawn", sentence: "This article was withdrawn" },
  removal: { badge: "Removed", sentence: "This article was removed by its publisher" },
  expression_of_concern: {
    badge: "Expression of concern",
    sentence: "The publisher issued an expression of concern about this article",
  },
  correction: { badge: "Corrected", sentence: "A correction to this article was published" },
}

/** An unknown notice's own words: its label, else its type, else "Notice". */
function ownWords(notice: Notice): string {
  return notice.label.trim() || notice.type.replaceAll("_", " ").trim() || "Notice"
}

/** A notice's word for a badge: "Retracted", "Withdrawn", "Corrected"… */
export function noticeLabel(notice: Notice): string {
  return NOTICE_WORDS[notice.type]?.badge ?? ownWords(notice)
}

/** What a notice says about the article, as a sentence without its final stop. */
export function noticeSentence(notice: Notice): string {
  const known = NOTICE_WORDS[notice.type]
  if (known) return known.sentence
  const words = ownWords(notice)
  return words === "Notice"
    ? "A notice was published about this article"
    : `A notice (${words.toLowerCase()}) was published about this article`
}

/** The notice a reader must see first: a retraction, withdrawal, removal or expression of concern. */
export function seriousNotice(notices: readonly Notice[]): Notice | undefined {
  return notices.find(isSeriousNotice)
}
