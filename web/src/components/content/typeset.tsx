import { Fragment, type ReactNode } from "react"

import { typesetParts, type TypesetLang, type TypesetPart } from "@/lib/typeset"

/**
 * A text typeset for the page (`typeset` in @/lib/typeset): typographic quotes, dashes, minus signs,
 * no-break spaces, a language's own spacing, superscripts, and acronyms as small caps where the text is in the
 * serif (`acronyms`). The data stays as written; this is only what the page draws.
 */
export function Typeset({
  text,
  lang,
  acronyms = false,
}: {
  text: string
  /** The text's language (`guessLang`): "fr" adds the French spacing rules. */
  lang?: TypesetLang | null
  /** Small-caps acronyms: serif text only. */
  acronyms?: boolean
}): ReactNode {
  return renderTypesetParts(typesetParts(text, { lang, acronyms }))
}

/** Typeset parts as React nodes. */
export function renderTypesetParts(parts: readonly TypesetPart[]): ReactNode {
  if (parts.length === 1 && typeof parts[0] === "string" && !parts[0].includes(STAR))
    return parts[0]
  return parts.map((part, i) => <Fragment key={i}>{renderPart(part)}</Fragment>)
}

const STAR = "★"

/**
 * The star of a headline row (★): none of the app's faces has it, so it is drawn, in the text's
 * colour and on its x-height; its character stays for screen readers and copying.
 */
export function StarGlyph({ className }: { className?: string }) {
  return (
    <span className={className}>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="inline-block size-[0.8em] align-[-0.05em]"
        fill="currentColor"
      >
        <path d="M12 2.6l2.8 6.1 6.7.7-5 4.5 1.4 6.6L12 17.1l-5.9 3.4 1.4-6.6-5-4.5 6.7-.7z" />
      </svg>
      <span className="sr-only">{STAR}</span>
    </span>
  )
}

/** A text with its stars drawn. */
function withStars(text: string): ReactNode {
  if (!text.includes(STAR)) return text
  return text.split(STAR).map((piece, i) => (
    <Fragment key={i}>
      {i > 0 ? <StarGlyph /> : null}
      {piece}
    </Fragment>
  ))
}

function renderPart(part: TypesetPart): ReactNode {
  if (typeof part === "string") return withStars(part)
  switch (part.t) {
    case "abbr":
      return <abbr className="ac">{part.text}</abbr>
    case "sup":
      return <sup>{part.text}</sup>
    case "muted":
      return <span className="text-muted-foreground">{part.text}</span>
  }
}
