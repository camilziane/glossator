import type { Prior } from "@/lib/data"
import {
  isRelevance,
  priorMethod,
  priorWords,
  RELEVANCE,
  relevanceDescription,
  relevanceLabel,
  type Relevance,
} from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * An inbox paper's relevance (Haiku's triage, 0 to 3) as a mark in the gutter of its row: the ¶
 * only for what is in scope (3, rubric), an ink • related (2), a muted · loosely related (1), a muted
 * ring unrelated or not rated (0, null). The mark is an image with its words for screen readers ("Relevance 3 of 3: In
 * scope"); `showLabel` writes the word beside it.
 *
 * ```tsx
 * <RelevanceMark value={paper.triage.relevance} />            // the gutter of a row
 * <RelevanceMark value={3} showLabel />                        // ¶ In scope
 * ```
 */
export function RelevanceMark({
  value,
  showLabel = false,
  className,
}: {
  value: number | null
  showLabel?: boolean
  className?: string
}) {
  const rated = isRelevance(value)
  const level = rated ? value : null
  return (
    <span
      role="img"
      aria-label={relevanceDescription(value)}
      title={
        level !== null
          ? `${RELEVANCE[level].label}: ${RELEVANCE[level].help}`
          : relevanceLabel(null)
      }
      data-relevance={level ?? "none"}
      className={cn("inline-flex items-baseline gap-1.5", className)}
    >
      <Glyph level={level} />
      {showLabel ? (
        <span
          aria-hidden
          className={cn(
            "font-sans text-kbd font-medium",
            level !== null && level >= 2 ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {relevanceLabel(level)}
        </span>
      ) : null}
    </span>
  )
}

/** The mark alone (decorative: what carries it says it in words). */
function Glyph({ level }: { level: Relevance | null }) {
  const box = "inline-block w-[1ch] text-center font-serif text-read leading-none"
  if (level === 3)
    return (
      <span aria-hidden className={cn(box, "font-semibold text-rubric")}>
        ¶
      </span>
    )
  if (level === 2)
    return (
      <span aria-hidden className={cn(box, "text-foreground")}>
        •
      </span>
    )
  if (level === 1)
    return (
      <span aria-hidden className={cn(box, "font-bold text-muted-foreground")}>
        ·
      </span>
    )
  // A ring the faces lack as a glyph: drawn, sized on the x-height.
  return (
    <span aria-hidden className={cn(box, "text-muted-foreground")}>
      <svg viewBox="0 0 10 10" className="inline-block size-[0.42em] align-[0.08em]">
        <circle cx="5" cy="5" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </span>
  )
}

/**
 * How close an inbox paper is to the library before any model read it, in words and a number:
 * "closest to ML methods · 0.86" (the number in tabular figures, exposed as a meter). Nothing for a
 * paper the prior did not score.
 *
 * ```tsx
 * <PriorNote prior={paper.prior} bibLabel={bib.short} />
 * <PriorNote prior={paper.prior} bibLabel={bib.short} words={false} />   // "0.86" alone
 * ```
 */
export function PriorNote({
  prior,
  bibLabel,
  words = true,
  className,
}: {
  prior: Prior | null
  /** The closest bibliography's name as the page shows it (else its key). */
  bibLabel?: string
  /** "closest to …" before the number. */
  words?: boolean
  className?: string
}) {
  if (!prior) return null
  const score = prior.score.toFixed(2)
  const where = bibLabel ?? prior.bib
  const how = priorMethod(prior.by)
  return (
    // Laid out as text: in a narrow margin the words wrap like a sentence, and "· 0.86" stays whole.
    <span
      className={cn("text-muted-foreground", className)}
      title={`Prior ${score}: ${priorWords(where)}, ${how}`}
    >
      {words ? <span aria-hidden>{priorWords(where)} </span> : null}
      <span className="whitespace-nowrap">
        {words ? <span aria-hidden>· </span> : null}
        <span
          role="meter"
          aria-label={`Prior, closeness to ${where}`}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={prior.score}
          aria-valuetext={`${score} (${how})`}
          className="text-foreground num"
        >
          {score}
        </span>
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------- compat
// The former stars and meters, drawn in the new look so every page keeps working until it moves to
// RelevanceMark and PriorNote. Retire them once no feature imports them.

/**
 * @deprecated Use `<RelevanceMark value showLabel />`. Draws the relevance mark, with the word unless
 * `showLabel` is false.
 */
export function RelevanceStars({
  value,
  showLabel = true,
  className,
}: {
  value: number | null
  showLabel?: boolean
  className?: string
}) {
  return <RelevanceMark value={value} showLabel={showLabel} className={className} />
}

/** @deprecated Use `<RelevanceMark />`. Draws the relevance mark (decorative). */
export function Stars({ value, className }: { value: Relevance | null; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex", className)}>
      <Glyph level={value} />
    </span>
  )
}

/** @deprecated Bars are gone (a number says it): draws nothing. */
export function MeterBar(_props: { value: number; className?: string }) {
  return null
}

/**
 * @deprecated Use `<PriorNote prior bibLabel />`. Draws the prior as words and a number; without
 * `showLabel`, the number alone.
 */
export function PriorMeter({
  prior,
  bibLabel,
  showLabel = true,
  className,
}: {
  prior: Prior | null
  bibLabel?: string
  showLabel?: boolean
  className?: string
}) {
  if (!prior) {
    return (
      <span className={cn("inline-flex text-kbd text-muted-foreground", className)}>
        <span className="sr-only">Prior: not scored</span>
      </span>
    )
  }
  return (
    <PriorNote
      prior={prior}
      bibLabel={bibLabel}
      words={showLabel}
      className={cn("text-kbd", className)}
    />
  )
}
