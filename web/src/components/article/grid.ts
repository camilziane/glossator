/**
 * Where things sit in the glossed grid (the shell's `glossGrid`): ≥ 1280 px the rubric margin, the
 * text and the gloss; 1024–1279 px the text and the gloss; narrower one column. In print, the text
 * and an outer gloss column (A4 is narrower than the screen's breakpoints).
 */
import { glossGrid } from "@/components/shell/page"
import { cn } from "@/lib/utils"

/** A band of the article in the grid: the header, a section, the colophon. */
export const GRID = cn(
  glossGrid,
  "lg:justify-center print:grid-cols-[minmax(0,1fr)_13.5rem] print:gap-x-8"
)

export const AT = {
  /** The rubric margin (≥ 1280 px); above the text below it. */
  rubric: "min-w-0 lg:col-span-2 xl:col-span-1 xl:col-start-1 print:col-span-2",
  /** The text column. */
  text: "min-w-0 lg:col-start-1 xl:col-start-2 print:col-start-1",
  /** The gloss column (the margin of notes and facts). */
  gloss: "min-w-0 lg:col-start-2 xl:col-start-3 print:col-start-2",
  /** Across the text and the gloss (wide tables, the figures). */
  wide: "min-w-0 lg:col-span-2 lg:col-start-1 xl:col-span-2 xl:col-start-2 print:col-span-2 print:col-start-1",
} as const
