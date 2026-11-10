import { Fragment } from "react"

import { fullReference, referenceParts, type CiteCard } from "@/lib/cite"
import { cn } from "@/lib/utils"

/**
 * An article's citation as a line: the surnames in small caps, "et al.", the year, then the venue in
 * the serif's italic ("NOVAK & ITO 2024 · Trans. Synth. Signals"). Its face and size come from where
 * it is (a serif meta line, a sans row); the small caps show in the serif.
 *
 * ```tsx
 * <CiteLine card={article} className="font-serif text-[0.9375rem] text-muted-foreground" />
 * <CiteLine card={article} separator=", " />          // "Novak & Ito 2024, Trans. Synth. Signals"
 * <CiteLine card={article} venue={false} />           // "Novak & Ito 2024"
 * ```
 */
export function CiteLine({
  card,
  separator = " · ",
  venue: showVenue = true,
  className,
}: {
  card: CiteCard
  separator?: string
  /** The venue after the year. */
  venue?: boolean
  className?: string
}) {
  const { names, etAl, year, venue } = referenceParts(card)
  if (names.length === 0) {
    return <span className={cn("cite", className)}>{card.cite || card.key}</span>
  }
  return (
    <span className={cn("cite", className)}>
      {names.map((name, i) => (
        <Fragment key={i}>
          {i > 0 ? " & " : null}
          <span className="au">{name}</span>
        </Fragment>
      ))}
      {etAl ? " et al." : null}
      {year ? ` ${year}` : null}
      {showVenue && venue ? (
        <>
          {separator}
          <i>{venue}</i>
        </>
      ) : null}
    </span>
  )
}

/** The formatted reference with its venue in italic: "Novak & Ito 2024, *Trans. Synth. Signals*". */
export function Reference({ card, className }: { card: CiteCard; className?: string }) {
  const { lead, venue } = referenceParts(card)
  return (
    <span className={className}>
      {lead}
      {venue ? (
        <>
          , <i>{venue}</i>
        </>
      ) : null}
    </span>
  )
}

/**
 * The full reference, its venue in italic: "Jumper, J. et al. Highly accurate protein structure
 * prediction with AlphaFold. *Nature* 596, 583–589 (2021)." (`formatReference` is the same as plain text.)
 */
export function FullReferenceText({ card, className }: { card: CiteCard; className?: string }) {
  const { authors, title, venue, tail } = fullReference(card)
  if (!authors && !title) return <span className={className}>{card.cite || card.key}</span>
  return (
    <span className={className}>
      {venue
        ? [authors, title].filter(Boolean).join(" ")
        : [authors, title].filter(Boolean).join(" ").replace(/\.$/u, "")}
      {venue ? (
        <>
          {" "}
          <i>{venue}</i>
          {tail}
        </>
      ) : (
        // Without a venue the year follows the title: "Mendes, A. A title (2023)."
        tail
      )}
    </span>
  )
}
