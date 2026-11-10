/**
 * The TanStack Table v9 features the hub's tables use (registered once, at module scope, so the
 * tables' inputs stay stable) and the filter functions of the Articles table.
 */
import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  constructFilterFn,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table"

import { matchesTokens, queryTokens } from "./model"
import { inYearRange, type TagMode, type YearRange } from "./url-state"

export type HubColumnKind = "article" | "text" | "year" | "tags" | "hidden"

export interface HubColumnMeta {
  /** The column's name in its header and in the Columns menu. */
  title: string
  /** Narrowest width, rem. */
  min: number
  /** Width the content would like, rem: spare room goes to columns in proportion to ideal − min. */
  ideal: number
  kind: HubColumnKind
  /** Hidden unless the reader shows it (Tags). */
  defaultHidden?: boolean
  /** Figures: right-aligned in tabular figures. */
  numeric?: boolean
  /** Stays in view while the table scrolls sideways (the article on the left, key metrics right). */
  pin?: "left" | "right"
  /** An id (`isIdTable`): broken only after its hyphens. */
  ids?: boolean
}

export const hubFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  columnVisibilityFeature,
  columnMeta: metaHelper<HubColumnMeta>(),
})

export type HubFeatures = typeof hubFeatures

/** Every word of the query (folded) must occur in the row's folded text. */
export const tokensFilter = constructFilterFn({
  filter: (haystack: unknown, tokens: readonly string[]) =>
    typeof haystack === "string" && matchesTokens(haystack, tokens),
  resolveFilterValue: (query: unknown) => (typeof query === "string" ? queryTokens(query) : []),
  autoRemove: (query: unknown) => typeof query !== "string" || queryTokens(query).length === 0,
})

/** Rows whose value is one of the chosen values (an empty choice keeps every row). */
export const oneOfFilter = constructFilterFn({
  filter: (value: unknown, chosen: readonly unknown[]) => chosen.includes(value),
  autoRemove: (chosen: unknown) => !Array.isArray(chosen) || chosen.length === 0,
})

/** The tags chosen, and whether a row needs all of them or any one. */
export interface TagChoice {
  readonly tags: readonly string[]
  readonly mode: TagMode
}

/** Whether a row's tags satisfy a choice (no tag chosen: every row). */
export function matchesTags(values: readonly string[], choice: TagChoice): boolean {
  if (choice.tags.length === 0) return true
  return choice.mode === "any"
    ? choice.tags.some((t) => values.includes(t))
    : choice.tags.every((t) => values.includes(t))
}

/** Rows having all the chosen tags, or any of them. */
export const tagsFilter = constructFilterFn({
  filter: (values: unknown, choice: TagChoice) =>
    Array.isArray(values) && matchesTags(values as string[], choice),
  autoRemove: (choice: unknown) =>
    !choice || typeof choice !== "object" || !(choice as TagChoice).tags?.length,
})

export const yearRangeFilter = constructFilterFn({
  filter: (year: unknown, range: YearRange | null) =>
    inYearRange(typeof year === "number" ? year : null, range),
  autoRemove: (range: unknown) => range === null || range === undefined,
})
