/**
 * Where things sit in an article: one column at every width (the phone's layout, on every screen,
 * centred: the shell's `column` width). Labels stand over their text, notes (quotes, sources)
 * follow the text they gloss, wide tables and the figures take the column's whole width. Print
 * keeps the same column.
 */

/** A band of the article: the header, a section, the colophon. */
export const GRID = "grid grid-cols-1"

export const AT = {
  /** The text (its paragraphs keep the measure). */
  text: "min-w-0",
  /** Notes and facts, after the text they gloss. */
  gloss: "min-w-0",
  /** Wide tables and the figures: the column's whole width. */
  wide: "min-w-0",
} as const
