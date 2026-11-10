import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The app has two grids (POLISH 10):
 * - `full`: the window's width at the page gutters (16 px on phones, 32 px from 768 px): the hub, the
 *   inbox, the search;
 * - `glossed`: the glossed grid, centred (`glossGrid`: margin, measure, gloss): Today, an article, the
 *   page not found. `reading` is its former name.
 * `page` (76 rem, centred) is the former third width: move off it.
 */
export type PageWidth = "full" | "glossed" | "reading" | "page"

/**
 * The glossed grid of a reading page (the article): ≥ 1280 px a left margin for the rubrics
 * (152 px), the measure (34 rem) and the gloss (300 px); 1024–1279 px the measure and a 260 px gloss;
 * narrower, one column. Children place themselves in it (`col-start-…`); the article's skeleton
 * draws the same grid.
 */
export const glossGrid =
  "grid grid-cols-1 gap-x-12 lg:grid-cols-[minmax(0,34rem)_16.25rem] xl:grid-cols-[9.5rem_minmax(0,34rem)_18.75rem]"

/** The page gutters, for a frame of one's own (the inbox's): 16 px, 32 px from 768 px. */
export const PAGE_GUTTERS = "px-4 md:px-8"

const WIDTHS: Record<PageWidth, string> = {
  /** The window's width (the hub's tables, the inbox, the search). */
  full: "",
  /** The glossed grid's width (9.5 + 34 + 18.75 rem and two 3 rem gaps), centred. */
  glossed: "max-w-[68.25rem]",
  /** @deprecated The glossed grid's former name. */
  reading: "max-w-[68.25rem]",
  /** @deprecated 76 rem: use `full` or `glossed`. */
  page: "max-w-[76rem]",
}

/**
 * The frame of a page's content: the page gutters everywhere and one of the two grids' widths:
 * `full` or `glossed` (see `PageWidth`).
 */
export function Page({
  children,
  width = "page",
  className,
}: {
  children: ReactNode
  width?: PageWidth
  className?: string
}) {
  return (
    <div className={cn("w-full pt-8 pb-16", PAGE_GUTTERS)}>
      <div className={cn("mx-auto w-full", WIDTHS[width], className)}>{children}</div>
    </div>
  )
}

/**
 * A page's title line: the h1 in the serif title style (22/28), an optional quiet `meta` beside it
 * ("49 articles · 2009–2026"), the actions on the same line, and an optional quiet description under
 * it, in the measure. No eyebrow: the top bar says where the reader is.
 */
export function PageHeader({
  title,
  meta,
  description,
  actions,
  className,
  titleId,
}: {
  title: ReactNode
  meta?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  titleId?: string
}) {
  return (
    <header className={cn("mb-8", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 id={titleId} className="min-w-0 title text-foreground">
            {title}
          </h1>
          {meta ? <p className="text-sm text-muted-foreground num">{meta}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {description ? (
        <div className="mt-2 max-w-measure font-serif text-note text-pretty text-muted-foreground">
          {description}
        </div>
      ) : null}
    </header>
  )
}
