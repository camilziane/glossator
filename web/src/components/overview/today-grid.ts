/**
 * Today's grid: the glossed grid of the article (`Page width="reading"`), its text column at the
 * same left edge, in three columns that every section shares (its rows are subgrids):
 *
 * - the hang (left): the relevance marks against the text; from 1280 px it is the glossed grid's
 *   margin and gutter (9.5 + 3 rem), where the years of Recently published hang like the article's
 *   rubrics;
 * - the text (the measure, 34 rem): the sentence, titles, scopes, meta lines;
 * - the counts (right), flush right like a contents page's folios.
 *
 * Below 1280 px the text starts at the page's edge and the marks hang into its gutter (from 640 px;
 * a phone keeps them inside); the years go above their articles.
 */
export const TODAY_GRID =
  "grid grid-cols-[1.5rem_minmax(0,1fr)_auto] sm:-ml-6 md:grid-cols-[1.5rem_minmax(0,34rem)_5rem] xl:ml-0 xl:grid-cols-[12.5rem_minmax(0,34rem)_5rem]"

/** Today's page frame: the glossed grid's (the article's) width. */
export const TODAY_PAGE_WIDTH = "reading" as const

/** A row (or a section) of the grid: it spans the three columns and lends them to its children. */
export const TODAY_ROW = "col-span-full grid grid-cols-subgrid"

/** The text column. */
export const TODAY_TEXT = "col-start-2"

/**
 * A mark hanging against the text (the relevance of an inbox paper), inside its row (so the row's
 * link and wash cover it): out to the left of the text, on the first line (the row's `py-2`).
 */
export const TODAY_MARK = "absolute top-2 right-full pr-2 leading-[1.3125rem] xl:pr-3"

/** A count in the right column, flush right. */
export const TODAY_COUNT = "col-start-3 justify-self-end pl-3"

/**
 * A row's link covers the whole row: its ::after (on top, transparent) takes the pointer anywhere on
 * the row, its ::before (behind the words) is the wash on hover, press and keyboard focus. Both span
 * the text and the gutter where the marks hang (not the years' margin), a little beyond the text on
 * the right. The row is `relative isolate`.
 */
export const TODAY_ROW_LINK =
  "before:absolute before:inset-y-0 before:-right-3 before:-left-6 before:-z-10 before:transition-colors hover:before:bg-muted focus-visible:before:bg-muted active:before:bg-muted xl:before:-left-12 after:absolute after:inset-y-0 after:-right-3 after:-left-6 after:z-10 xl:after:-left-12"
